import mongoose from 'mongoose';
import {
  LoanRequest,
  LoanStatus,
  OPEN_LOAN_STATUSES,
  DSA_SETTABLE_STATUSES,
} from '../models/LoanRequest';
import { Property } from '../models/Property';
import { User, UserRole, AccountStatus } from '../models/User';
import { ActivityType } from '../models/UserActivity';
import { PUBLIC_FILTER } from './property.service';
import { recordPropertyEvent } from './activity.service';
import { notify } from './notification.service';
import { httpError } from '../utils/httpError';

const oid = (id: string) => new mongoose.Types.ObjectId(id);

const PROPERTY_SUMMARY_FIELDS = 'projectName title locality city coverImageUrl minPrice maxPrice';

// ─── View mapping ─────────────────────────────────────────────────────────────

export interface LoanView {
  _id: string;
  status: LoanStatus;
  contactName: string;
  contactPhone: string;
  notes?: string;
  dsaNote?: string;
  consentAt: string;
  assignedAt?: string;
  statusUpdatedAt: string;
  createdAt: string;
  property: {
    _id: string; projectName: string; title: string; locality: string; city: string;
    coverImageUrl?: string; minPrice: number; maxPrice: number;
  } | null;
  dsa?: { name: string; phone?: string };
  customer?: { name: string; email?: string };
}

function toLoanView(l: any, audience: 'customer' | 'dsa'): LoanView {
  const prop = l.propertyId && typeof l.propertyId === 'object' && l.propertyId.projectName ? l.propertyId : null;
  const dsa = l.dsaId && typeof l.dsaId === 'object' && l.dsaId.name ? l.dsaId : null;
  const customer = l.customerId && typeof l.customerId === 'object' && l.customerId.name ? l.customerId : null;

  return {
    _id: String(l._id),
    status: l.status,
    contactName: l.contactName,
    contactPhone: l.contactPhone,
    notes: l.notes,
    dsaNote: l.dsaNote,
    consentAt: l.consentAt.toISOString(),
    assignedAt: l.assignedAt ? l.assignedAt.toISOString() : undefined,
    statusUpdatedAt: l.statusUpdatedAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
    property: prop
      ? {
          _id: String(prop._id),
          projectName: prop.projectName,
          title: prop.title,
          locality: prop.locality,
          city: prop.city,
          coverImageUrl: prop.coverImageUrl,
          minPrice: prop.minPrice,
          maxPrice: prop.maxPrice,
        }
      : null,
    dsa: audience === 'customer' && dsa ? { name: dsa.name, phone: dsa.phone } : undefined,
    customer: audience === 'dsa' && customer ? { name: customer.name, email: customer.email } : undefined,
  };
}

// ─── Lead routing ─────────────────────────────────────────────────────────────

/** Active DSA with the fewest live leads (ties broken by who joined first). */
async function pickDsa(): Promise<mongoose.Types.ObjectId | null> {
  const dsas = await User.find({
    role: UserRole.DSA,
    accountStatus: AccountStatus.ACTIVE,
    mustChangePassword: { $ne: true }, // can't use the portal until they've set their own password
  })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean();
  if (dsas.length === 0) return null;

  const load: Array<{ _id: mongoose.Types.ObjectId; n: number }> = await LoanRequest.aggregate([
    {
      $match: {
        dsaId: { $in: dsas.map((d) => d._id) },
        status: { $in: [LoanStatus.ASSIGNED, LoanStatus.IN_PROGRESS, LoanStatus.DOCUMENTS_REQUIRED] },
      },
    },
    { $group: { _id: '$dsaId', n: { $sum: 1 } } },
  ]);
  const loadById = new Map(load.map((l) => [String(l._id), l.n]));

  let best = dsas[0]._id;
  let bestLoad = loadById.get(String(best)) || 0;
  for (const d of dsas.slice(1)) {
    const n = loadById.get(String(d._id)) || 0;
    if (n < bestLoad) { best = d._id; bestLoad = n; }
  }
  return best;
}

async function assignLoan(loan: InstanceType<typeof LoanRequest>): Promise<boolean> {
  const dsaId = await pickDsa();
  if (!dsaId) return false;

  loan.dsaId = dsaId;
  loan.status = LoanStatus.ASSIGNED;
  loan.assignedAt = new Date();
  loan.statusUpdatedAt = new Date();
  await loan.save();

  await Promise.all([
    notify({
      userId: dsaId,
      type: 'LOAN_REQUESTED',
      title: 'New customer to connect with',
      message: `${loan.contactName} asked to be connected with a DSA partner.`,
      link: '/dsa/leads',
    }),
    notify({
      userId: loan.customerId,
      type: 'LOAN_UPDATED',
      title: 'A DSA partner has been assigned',
      message: 'A verified DSA partner will contact you shortly.',
      link: '/dsa-connect',
    }),
  ]);
  return true;
}

/** Leads that arrived while no DSA was available get routed as soon as one is. */
export async function routePendingLoans(limit = 50): Promise<void> {
  const waiting = await LoanRequest.find({ status: LoanStatus.SUBMITTED, dsaId: { $exists: false } })
    .sort({ createdAt: 1 })
    .limit(limit);
  for (const loan of waiting) {
    if (!(await assignLoan(loan))) break; // no DSA available — stop trying
  }
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface CreateLoanInput {
  propertyId?: string;
  contactName: string;
  contactPhone: string;
  notes?: string;
  consent: boolean;
}

export async function createLoanRequest(customerId: string, input: CreateLoanInput): Promise<LoanView> {
  if (input.consent !== true) {
    throw httpError(422, 'Your consent to share these details with a DSA partner is required');
  }

  let propertyId: mongoose.Types.ObjectId | undefined;
  if (input.propertyId) {
    if (!mongoose.isValidObjectId(input.propertyId)) throw httpError(400, 'Invalid property ID');
    const property = await Property.findOne({ $and: [PUBLIC_FILTER, { _id: input.propertyId }] }).select('_id').lean();
    if (!property) throw httpError(404, 'Property not found');
    propertyId = property._id;
  }

  const duplicate = await LoanRequest.exists({
    customerId: oid(customerId),
    status: { $in: OPEN_LOAN_STATUSES },
    propertyId: propertyId ?? { $exists: false },
  });
  if (duplicate) {
    throw httpError(
      409,
      propertyId
        ? 'You already have an open DSA request for this property'
        : 'You already have an open general DSA request'
    );
  }

  const loan = await LoanRequest.create({
    customerId: oid(customerId),
    propertyId,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    notes: input.notes || undefined,
    consentGiven: true,
    consentAt: new Date(),
  });

  if (propertyId) await recordPropertyEvent(customerId, ActivityType.LOAN, String(propertyId));
  await assignLoan(loan); // stays SUBMITTED if no DSA is available yet

  return getLoanForCustomer(customerId, String(loan._id));
}

async function getLoanForCustomer(customerId: string, loanId: string): Promise<LoanView> {
  const l = await LoanRequest.findOne({ _id: loanId, customerId: oid(customerId) })
    .populate('propertyId', PROPERTY_SUMMARY_FIELDS)
    .populate('dsaId', 'name phone')
    .lean();
  if (!l) throw httpError(404, 'Request not found');
  return toLoanView(l, 'customer');
}

export async function listCustomerLoans(customerId: string): Promise<LoanView[]> {
  const rows = await LoanRequest.find({ customerId: oid(customerId) })
    .populate('propertyId', PROPERTY_SUMMARY_FIELDS)
    .populate('dsaId', 'name phone')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return rows.map((r) => toLoanView(r, 'customer'));
}

export async function cancelLoanRequest(customerId: string, loanId: string): Promise<LoanView> {
  if (!mongoose.isValidObjectId(loanId)) throw httpError(400, 'Invalid request ID');
  const loan = await LoanRequest.findOne({ _id: loanId, customerId: oid(customerId) });
  if (!loan) throw httpError(404, 'Request not found');
  if (!OPEN_LOAN_STATUSES.includes(loan.status)) {
    throw httpError(409, 'Only open requests can be withdrawn');
  }

  loan.status = LoanStatus.CANCELLED;
  loan.statusUpdatedAt = new Date();
  await loan.save();

  if (loan.dsaId) {
    await notify({
      userId: loan.dsaId,
      type: 'LOAN_UPDATED',
      title: 'Request withdrawn',
      message: `${loan.contactName} withdrew their request to connect.`,
      link: '/dsa/leads',
    });
  }
  return getLoanForCustomer(customerId, loanId);
}

export async function getCustomerLoanCounts(customerId: string): Promise<{ active: number; total: number }> {
  const [active, total] = await Promise.all([
    LoanRequest.countDocuments({ customerId: oid(customerId), status: { $in: OPEN_LOAN_STATUSES } }),
    LoanRequest.countDocuments({ customerId: oid(customerId) }),
  ]);
  return { active, total };
}

export async function getLatestLoan(customerId: string): Promise<LoanView | null> {
  const l = await LoanRequest.findOne({ customerId: oid(customerId) })
    .populate('propertyId', PROPERTY_SUMMARY_FIELDS)
    .populate('dsaId', 'name phone')
    .sort({ createdAt: -1 })
    .lean();
  return l ? toLoanView(l, 'customer') : null;
}

// ─── DSA ──────────────────────────────────────────────────────────────────────

export async function listDsaLeads(dsaId: string): Promise<LoanView[]> {
  await routePendingLoans();
  const rows = await LoanRequest.find({ dsaId: oid(dsaId) })
    .populate('propertyId', PROPERTY_SUMMARY_FIELDS)
    .populate('customerId', 'name email')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  const views = rows.map((r) => toLoanView(r, 'dsa'));
  // Open leads first
  const isOpen = (s: LoanStatus) => OPEN_LOAN_STATUSES.includes(s);
  return views.sort((a, b) => Number(isOpen(b.status)) - Number(isOpen(a.status)));
}

export async function getDsaLeadCounts(
  dsaId: string
): Promise<{ assigned: number; active: number; completed: number; total: number }> {
  const d = oid(dsaId);
  const [assigned, active, completed, total] = await Promise.all([
    LoanRequest.countDocuments({ dsaId: d, status: LoanStatus.ASSIGNED }),
    LoanRequest.countDocuments({
      dsaId: d,
      status: { $in: [LoanStatus.IN_PROGRESS, LoanStatus.DOCUMENTS_REQUIRED] },
    }),
    LoanRequest.countDocuments({ dsaId: d, status: LoanStatus.COMPLETED }),
    LoanRequest.countDocuments({ dsaId: d }),
  ]);
  return { assigned, active, completed, total };
}

export async function updateLeadStatus(
  dsaId: string,
  loanId: string,
  input: { status: LoanStatus; note?: string }
): Promise<LoanView> {
  if (!mongoose.isValidObjectId(loanId)) throw httpError(400, 'Invalid request ID');
  if (!DSA_SETTABLE_STATUSES.includes(input.status)) throw httpError(422, 'Invalid status for a lead');

  const loan = await LoanRequest.findOne({ _id: loanId, dsaId: oid(dsaId) });
  if (!loan) throw httpError(404, 'Lead not found');
  if (!OPEN_LOAN_STATUSES.includes(loan.status)) {
    throw httpError(409, `This lead is ${loan.status.toLowerCase()} and can no longer be updated`);
  }

  loan.status = input.status;
  loan.dsaNote = input.note?.trim() || loan.dsaNote;
  loan.statusUpdatedAt = new Date();
  await loan.save();

  const copy: Record<string, string> = {
    [LoanStatus.IN_PROGRESS]: 'Your DSA partner has started working with you.',
    [LoanStatus.DOCUMENTS_REQUIRED]: 'Your DSA partner needs a few documents from you to proceed.',
    [LoanStatus.COMPLETED]: 'Your DSA partner has completed their assistance.',
    [LoanStatus.CLOSED]: 'Your request has been closed by your DSA partner.',
  };
  await notify({
    userId: loan.customerId,
    type: 'LOAN_UPDATED',
    title: 'Your DSA request was updated',
    message: loan.dsaNote ? `${copy[input.status]} Note: "${loan.dsaNote}"` : copy[input.status],
    link: '/dsa-connect',
  });

  const fresh = await LoanRequest.findById(loan._id)
    .populate('propertyId', PROPERTY_SUMMARY_FIELDS)
    .populate('customerId', 'name email')
    .lean();
  return toLoanView(fresh, 'dsa');
}
