import mongoose from 'mongoose';
import {
  SiteVisit,
  VisitStatus,
  VisitSlot,
  VISIT_SLOT_LABELS,
  OPEN_VISIT_STATUSES,
} from '../models/SiteVisit';
import { Property } from '../models/Property';
import { ActivityType } from '../models/UserActivity';
import { PUBLIC_FILTER } from './property.service';
import { recordPropertyEvent } from './activity.service';
import { notify } from './notification.service';
import { httpError } from '../utils/httpError';

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;
const MAX_ADVANCE_DAYS = 60;
/** Hour (IST) at which each slot ends — used to reject slots that have already passed today. */
const SLOT_END_HOUR: Record<VisitSlot, number> = {
  [VisitSlot.MORNING]: 12,
  [VisitSlot.AFTERNOON]: 16,
  [VisitSlot.EVENING]: 19,
};

const oid = (id: string) => new mongoose.Types.ObjectId(id);

// ─── Date helpers (visits are date-only, India time) ─────────────────────────

export function todayIST(now = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(422, 'Visit date must be in YYYY-MM-DD format');
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw httpError(422, 'Visit date is not a valid calendar date');
  }
  return d;
}

/** Validates date + slot against "today" in India and returns the stored date. */
function assertBookable(dateStr: string, slot: VisitSlot, now = Date.now()): Date {
  const date = parseDateOnly(dateStr);
  if (!Object.values(VisitSlot).includes(slot)) throw httpError(422, 'Invalid time slot');

  const today = todayIST(now);
  const latest = new Date(Date.parse(`${today}T00:00:00.000Z`) + MAX_ADVANCE_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  if (dateStr < today) throw httpError(422, 'Visit date cannot be in the past');
  if (dateStr > latest) throw httpError(422, `Visits can be booked up to ${MAX_ADVANCE_DAYS} days in advance`);
  if (dateStr === today) {
    const hourIST = new Date(now + IST_OFFSET_MS).getUTCHours();
    if (hourIST >= SLOT_END_HOUR[slot]) throw httpError(422, 'That time slot has already passed today');
  }
  return date;
}

// ─── View mapping ─────────────────────────────────────────────────────────────

export interface VisitView {
  _id: string;
  status: VisitStatus;
  visitDate: string;
  timeSlot: VisitSlot;
  timeSlotLabel: string;
  proposedDate?: string;
  proposedSlot?: VisitSlot;
  proposedSlotLabel?: string;
  visitors: number;
  contactName: string;
  contactPhone: string;
  notes?: string;
  builderNote?: string;
  respondedAt?: string;
  createdAt: string;
  property: {
    _id: string; projectName: string; title: string; locality: string; city: string;
    address: string; coverImageUrl?: string;
  } | null;
  builder?: { name: string; phone?: string };
  customer?: { name: string; email?: string };
}

const PROPERTY_SUMMARY_FIELDS = 'projectName title locality city address coverImageUrl';

function toVisitView(v: any, audience: 'customer' | 'builder'): VisitView {
  const prop = v.propertyId && typeof v.propertyId === 'object' && v.propertyId.projectName ? v.propertyId : null;
  const builder = v.builderId && typeof v.builderId === 'object' && v.builderId.name ? v.builderId : null;
  const customer = v.customerId && typeof v.customerId === 'object' && v.customerId.name ? v.customerId : null;

  return {
    _id: String(v._id),
    status: v.status,
    visitDate: v.visitDate.toISOString(),
    timeSlot: v.timeSlot,
    timeSlotLabel: VISIT_SLOT_LABELS[v.timeSlot as VisitSlot],
    proposedDate: v.proposedDate ? v.proposedDate.toISOString() : undefined,
    proposedSlot: v.proposedSlot,
    proposedSlotLabel: v.proposedSlot ? VISIT_SLOT_LABELS[v.proposedSlot as VisitSlot] : undefined,
    visitors: v.visitors,
    contactName: v.contactName,
    contactPhone: v.contactPhone,
    notes: v.notes,
    builderNote: v.builderNote,
    respondedAt: v.respondedAt ? v.respondedAt.toISOString() : undefined,
    createdAt: v.createdAt.toISOString(),
    property: prop
      ? {
          _id: String(prop._id),
          projectName: prop.projectName,
          title: prop.title,
          locality: prop.locality,
          city: prop.city,
          address: prop.address,
          coverImageUrl: prop.coverImageUrl,
        }
      : null,
    // Builder contact is only revealed once they've agreed to host the visit
    builder:
      audience === 'customer' && builder
        ? { name: builder.name, phone: v.status === VisitStatus.CONFIRMED ? builder.phone : undefined }
        : undefined,
    customer: audience === 'builder' && customer ? { name: customer.name, email: customer.email } : undefined,
  };
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface CreateVisitInput {
  propertyId: string;
  visitDate: string;
  timeSlot: VisitSlot;
  visitors?: number;
  contactName: string;
  contactPhone: string;
  notes?: string;
}

export async function createVisit(customerId: string, input: CreateVisitInput): Promise<VisitView> {
  if (!mongoose.isValidObjectId(input.propertyId)) throw httpError(400, 'Invalid property ID');
  const visitDate = assertBookable(input.visitDate, input.timeSlot);

  const property = await Property.findOne({ $and: [PUBLIC_FILTER, { _id: input.propertyId }] })
    .select('builderId projectName')
    .lean();
  if (!property) throw httpError(404, 'Property not found');

  const existing = await SiteVisit.exists({
    customerId: oid(customerId),
    propertyId: property._id,
    status: { $in: OPEN_VISIT_STATUSES },
  });
  if (existing) {
    throw httpError(409, 'You already have an active site visit request for this property. Cancel it first to book a new one.');
  }

  const visit = await SiteVisit.create({
    customerId: oid(customerId),
    propertyId: property._id,
    builderId: property.builderId,
    visitDate,
    timeSlot: input.timeSlot,
    visitors: input.visitors || 1,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    notes: input.notes || undefined,
  });

  await recordPropertyEvent(customerId, ActivityType.VISIT, String(property._id));
  await notify({
    userId: property.builderId,
    type: 'VISIT_REQUESTED',
    title: 'New site visit request',
    message: `${input.contactName} wants to visit ${property.projectName} on ${input.visitDate} (${VISIT_SLOT_LABELS[input.timeSlot]}).`,
    link: '/builder/visits',
  });

  return getVisitForCustomer(customerId, String(visit._id));
}

async function getVisitForCustomer(customerId: string, visitId: string): Promise<VisitView> {
  const v = await SiteVisit.findOne({ _id: visitId, customerId: oid(customerId) })
    .populate('propertyId', PROPERTY_SUMMARY_FIELDS)
    .populate('builderId', 'name phone')
    .lean();
  if (!v) throw httpError(404, 'Site visit not found');
  return toVisitView(v, 'customer');
}

export async function listCustomerVisits(customerId: string): Promise<VisitView[]> {
  const rows = await SiteVisit.find({ customerId: oid(customerId) })
    .populate('propertyId', PROPERTY_SUMMARY_FIELDS)
    .populate('builderId', 'name phone')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return rows.map((r) => toVisitView(r, 'customer'));
}

export async function cancelVisit(customerId: string, visitId: string): Promise<VisitView> {
  if (!mongoose.isValidObjectId(visitId)) throw httpError(400, 'Invalid visit ID');
  const visit = await SiteVisit.findOne({ _id: visitId, customerId: oid(customerId) });
  if (!visit) throw httpError(404, 'Site visit not found');
  if (!OPEN_VISIT_STATUSES.includes(visit.status)) {
    throw httpError(409, `A ${visit.status.toLowerCase().replace('_', ' ')} visit cannot be cancelled`);
  }

  visit.status = VisitStatus.CANCELLED;
  visit.proposedDate = undefined;
  visit.proposedSlot = undefined;
  await visit.save();

  const prop = await Property.findById(visit.propertyId).select('projectName').lean();
  await notify({
    userId: visit.builderId,
    type: 'VISIT_UPDATED',
    title: 'Site visit cancelled',
    message: `${visit.contactName} cancelled their visit to ${prop?.projectName || 'your property'}.`,
    link: '/builder/visits',
  });
  return getVisitForCustomer(customerId, visitId);
}

export async function acceptReschedule(customerId: string, visitId: string): Promise<VisitView> {
  if (!mongoose.isValidObjectId(visitId)) throw httpError(400, 'Invalid visit ID');
  const visit = await SiteVisit.findOne({ _id: visitId, customerId: oid(customerId) });
  if (!visit) throw httpError(404, 'Site visit not found');
  if (visit.status !== VisitStatus.RESCHEDULE_PROPOSED || !visit.proposedDate || !visit.proposedSlot) {
    throw httpError(409, 'There is no reschedule proposal to accept');
  }

  visit.visitDate = visit.proposedDate;
  visit.timeSlot = visit.proposedSlot;
  visit.proposedDate = undefined;
  visit.proposedSlot = undefined;
  visit.status = VisitStatus.CONFIRMED;
  await visit.save();

  const prop = await Property.findById(visit.propertyId).select('projectName').lean();
  await notify({
    userId: visit.builderId,
    type: 'VISIT_UPDATED',
    title: 'Reschedule accepted',
    message: `${visit.contactName} accepted the new time for ${prop?.projectName || 'your property'}.`,
    link: '/builder/visits',
  });
  return getVisitForCustomer(customerId, visitId);
}

export async function getCustomerVisitCounts(customerId: string): Promise<{ upcoming: number; total: number }> {
  const [upcoming, total] = await Promise.all([
    SiteVisit.countDocuments({
      customerId: oid(customerId),
      status: { $in: OPEN_VISIT_STATUSES },
      visitDate: { $gte: parseDateOnly(todayIST()) },
    }),
    SiteVisit.countDocuments({ customerId: oid(customerId) }),
  ]);
  return { upcoming, total };
}

/** The customer's most relevant live visit: soonest confirmed, then anything needing attention. */
export async function getNextVisit(customerId: string): Promise<VisitView | null> {
  const rows = await SiteVisit.find({
    customerId: oid(customerId),
    status: { $in: OPEN_VISIT_STATUSES },
    visitDate: { $gte: parseDateOnly(todayIST()) },
  })
    .populate('propertyId', PROPERTY_SUMMARY_FIELDS)
    .populate('builderId', 'name phone')
    .sort({ visitDate: 1 })
    .limit(10)
    .lean();
  if (rows.length === 0) return null;
  const rank = (s: VisitStatus) =>
    s === VisitStatus.RESCHEDULE_PROPOSED ? 0 : s === VisitStatus.CONFIRMED ? 1 : 2;
  rows.sort((a, b) => rank(a.status) - rank(b.status) || a.visitDate.getTime() - b.visitDate.getTime());
  return toVisitView(rows[0], 'customer');
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export async function listBuilderVisits(builderId: string, status?: string): Promise<VisitView[]> {
  const filter: Record<string, any> = { builderId: oid(builderId) };
  if (status && Object.values(VisitStatus).includes(status as VisitStatus)) filter.status = status;
  const rows = await SiteVisit.find(filter)
    .populate('propertyId', PROPERTY_SUMMARY_FIELDS)
    .populate('customerId', 'name email')
    .sort({ visitDate: 1, createdAt: -1 })
    .limit(200)
    .lean();
  return rows.map((r) => toVisitView(r, 'builder'));
}

export async function getBuilderVisitCounts(
  builderId: string
): Promise<{ pending: number; confirmed: number; total: number }> {
  const b = oid(builderId);
  const [pending, confirmed, total] = await Promise.all([
    SiteVisit.countDocuments({ builderId: b, status: VisitStatus.PENDING }),
    SiteVisit.countDocuments({ builderId: b, status: VisitStatus.CONFIRMED }),
    SiteVisit.countDocuments({ builderId: b }),
  ]);
  return { pending, confirmed, total };
}

export type VisitAction = 'confirm' | 'decline' | 'reschedule' | 'complete';

export interface RespondVisitInput {
  action: VisitAction;
  note?: string;
  newDate?: string;
  newSlot?: VisitSlot;
}

export async function respondToVisit(
  builderId: string,
  visitId: string,
  input: RespondVisitInput
): Promise<VisitView> {
  if (!mongoose.isValidObjectId(visitId)) throw httpError(400, 'Invalid visit ID');
  const visit = await SiteVisit.findOne({ _id: visitId, builderId: oid(builderId) });
  if (!visit) throw httpError(404, 'Site visit not found');

  const prop = await Property.findById(visit.propertyId).select('projectName').lean();
  const project = prop?.projectName || 'the property';
  const from = visit.status;
  let title = '';
  let message = '';

  switch (input.action) {
    case 'confirm':
      if (from !== VisitStatus.PENDING) throw httpError(409, 'Only pending requests can be confirmed');
      visit.status = VisitStatus.CONFIRMED;
      title = 'Site visit confirmed';
      message = `Your visit to ${project} is confirmed for ${visit.visitDate.toISOString().slice(0, 10)} (${VISIT_SLOT_LABELS[visit.timeSlot]}).`;
      break;

    case 'decline':
      if (from !== VisitStatus.PENDING && from !== VisitStatus.CONFIRMED) {
        throw httpError(409, 'Only pending or confirmed visits can be declined');
      }
      visit.status = VisitStatus.DECLINED;
      visit.proposedDate = undefined;
      visit.proposedSlot = undefined;
      title = 'Site visit declined';
      message = `The builder couldn't host your visit to ${project}. You can request another slot.`;
      break;

    case 'reschedule': {
      if (from !== VisitStatus.PENDING && from !== VisitStatus.CONFIRMED) {
        throw httpError(409, 'Only pending or confirmed visits can be rescheduled');
      }
      if (!input.newDate || !input.newSlot) throw httpError(422, 'A new date and time slot are required to reschedule');
      visit.proposedDate = assertBookable(input.newDate, input.newSlot);
      visit.proposedSlot = input.newSlot;
      visit.status = VisitStatus.RESCHEDULE_PROPOSED;
      title = 'New time proposed for your visit';
      message = `The builder suggested ${input.newDate} (${VISIT_SLOT_LABELS[input.newSlot]}) for ${project}. Please accept or cancel.`;
      break;
    }

    case 'complete':
      if (from !== VisitStatus.CONFIRMED) throw httpError(409, 'Only confirmed visits can be marked completed');
      if (visit.visitDate.toISOString().slice(0, 10) > todayIST()) {
        throw httpError(409, 'A visit can only be marked completed on or after its scheduled date');
      }
      visit.status = VisitStatus.COMPLETED;
      title = 'Site visit completed';
      message = `Thanks for visiting ${project}. Ready for the next step? You can connect with a DSA partner from the property page.`;
      break;

    default:
      throw httpError(422, 'Unknown action');
  }

  visit.builderNote = input.note?.trim() || visit.builderNote;
  visit.respondedAt = new Date();
  await visit.save();

  await notify({
    userId: visit.customerId,
    type: 'VISIT_UPDATED',
    title,
    message: visit.builderNote && input.action !== 'complete' ? `${message} Note: "${visit.builderNote}"` : message,
    link: '/visits',
  });

  const fresh = await SiteVisit.findById(visit._id)
    .populate('propertyId', PROPERTY_SUMMARY_FIELDS)
    .populate('customerId', 'name email')
    .lean();
  return toVisitView(fresh, 'builder');
}
