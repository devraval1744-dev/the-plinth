import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  BuilderApplication,
  ApplicationStatus,
  IBuilderApplication,
} from '../models/BuilderApplication';
import { DSAApplication, IDSAApplication } from '../models/DSAApplication';
import { User, UserRole, AccountStatus } from '../models/User';

const SALT_ROUNDS = 12;

// ─── Input types ─────────────────────────────────────────────────────────────

export interface SubmitBuilderApplicationInput {
  applicantName: string;
  email: string;
  phone: string;
  companyName: string;
  businessType: string;
  yearsOfExperience: number;
  numberOfProjects: number;
  reraRegistrationNumber?: string;
  officeAddress: string;
  city: string;
  state: string;
  website?: string;
  description: string;
}

export interface SubmitDSAApplicationInput {
  applicantName: string;
  email: string;
  phone: string;
  firmName?: string;
  employmentType: string;
  yearsOfExperience: number;
  currentOrganization?: string;
  areasOfOperation?: string[];
  bankPartnerships?: string;
  address: string;
  city: string;
  state: string;
  description: string;
}

export interface ReviewActionInput {
  adminUserId: string;
  adminNotes?: string;
  clarificationMessage?: string;
}

export type ApplicationType = 'builder' | 'dsa';

// ─── Submit ───────────────────────────────────────────────────────────────────

export async function submitBuilderApplication(
  input: SubmitBuilderApplicationInput
): Promise<IBuilderApplication> {
  const email = input.email.toLowerCase().trim();

  // Reject if a User account already exists with this email
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const err: any = new Error(
      'An account already exists with this email address. Please use the login page.'
    );
    err.statusCode = 409;
    throw err;
  }

  // Reject if an active/pending application already exists
  const existingApp = await BuilderApplication.findOne({
    email,
    status: { $in: [ApplicationStatus.PENDING, ApplicationStatus.APPROVED] },
  });
  if (existingApp) {
    const err: any = new Error(
      existingApp.status === ApplicationStatus.PENDING
        ? 'A builder application for this email is already pending review.'
        : 'A builder account with this email already exists.'
    );
    err.statusCode = 409;
    throw err;
  }

  const application = await BuilderApplication.create({ ...input, email });
  return application;
}

export async function submitDSAApplication(
  input: SubmitDSAApplicationInput
): Promise<IDSAApplication> {
  const email = input.email.toLowerCase().trim();

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const err: any = new Error(
      'An account already exists with this email address. Please use the login page.'
    );
    err.statusCode = 409;
    throw err;
  }

  const existingApp = await DSAApplication.findOne({
    email,
    status: { $in: [ApplicationStatus.PENDING, ApplicationStatus.APPROVED] },
  });
  if (existingApp) {
    const err: any = new Error(
      existingApp.status === ApplicationStatus.PENDING
        ? 'A DSA application for this email is already pending review.'
        : 'A DSA account with this email already exists.'
    );
    err.statusCode = 409;
    throw err;
  }

  const application = await DSAApplication.create({ ...input, email });
  return application;
}

// ─── List / Get ───────────────────────────────────────────────────────────────

export async function listBuilderApplications(
  statusFilter?: ApplicationStatus
): Promise<IBuilderApplication[]> {
  const query = statusFilter ? { status: statusFilter } : {};
  return BuilderApplication.find(query)
    .sort({ createdAt: -1 })
    .populate('reviewedBy', 'name email')
    .lean();
}

export async function listDSAApplications(
  statusFilter?: ApplicationStatus
): Promise<IDSAApplication[]> {
  const query = statusFilter ? { status: statusFilter } : {};
  return DSAApplication.find(query)
    .sort({ createdAt: -1 })
    .populate('reviewedBy', 'name email')
    .lean();
}

export async function getBuilderApplication(
  id: string
): Promise<IBuilderApplication> {
  if (!mongoose.isValidObjectId(id)) {
    const err: any = new Error('Invalid application ID');
    err.statusCode = 400;
    throw err;
  }
  const app = await BuilderApplication.findById(id)
    .populate('reviewedBy', 'name email')
    .populate('userId', 'name email accountStatus');
  if (!app) {
    const err: any = new Error('Application not found');
    err.statusCode = 404;
    throw err;
  }
  return app;
}

export async function getDSAApplication(id: string): Promise<IDSAApplication> {
  if (!mongoose.isValidObjectId(id)) {
    const err: any = new Error('Invalid application ID');
    err.statusCode = 400;
    throw err;
  }
  const app = await DSAApplication.findById(id)
    .populate('reviewedBy', 'name email')
    .populate('userId', 'name email accountStatus');
  if (!app) {
    const err: any = new Error('Application not found');
    err.statusCode = 404;
    throw err;
  }
  return app;
}

// ─── Application counts (for admin dashboard stats) ──────────────────────────

export async function getApplicationCounts(): Promise<{
  builderPending: number;
  dsaPending: number;
  builderTotal: number;
  dsaTotal: number;
}> {
  const [builderPending, dsaPending, builderTotal, dsaTotal] = await Promise.all([
    BuilderApplication.countDocuments({ status: ApplicationStatus.PENDING }),
    DSAApplication.countDocuments({ status: ApplicationStatus.PENDING }),
    BuilderApplication.countDocuments(),
    DSAApplication.countDocuments(),
  ]);
  return { builderPending, dsaPending, builderTotal, dsaTotal };
}

// ─── Approve ─────────────────────────────────────────────────────────────────

export async function approveBuilderApplication(
  appId: string,
  { adminUserId, adminNotes }: ReviewActionInput
): Promise<{ application: IBuilderApplication; temporaryPassword: string }> {
  const app = await getBuilderApplication(appId);

  if (app.status === ApplicationStatus.APPROVED) {
    const err: any = new Error('This application has already been approved');
    err.statusCode = 409;
    throw err;
  }

  // Generate a secure temporary password — builder must be notified out-of-band
  // (email notification is a later feature; for now password is returned to admin)
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

  // Check if a user with this email was created in a previous (failed) attempt
  let user = await User.findOne({ email: app.email });

  if (user) {
    // Reactivate and upgrade role if somehow already created
    user.role = UserRole.BUILDER;
    user.accountStatus = AccountStatus.ACTIVE;
    user.name = app.applicantName;
    user.phone = app.phone;
    user.passwordHash = passwordHash;
    user.mustChangePassword = true;
    await user.save();
  } else {
    user = await User.create({
      name: app.applicantName,
      email: app.email,
      phone: app.phone,
      passwordHash,
      role: UserRole.BUILDER,
      accountStatus: AccountStatus.ACTIVE,
      mustChangePassword: true,
    });
  }

  // Update application
  app.status = ApplicationStatus.APPROVED;
  app.adminNotes = adminNotes;
  app.reviewedAt = new Date();
  app.reviewedBy = new mongoose.Types.ObjectId(adminUserId);
  app.userId = user._id;
  await app.save();

  return { application: app, temporaryPassword };
}

export async function approveDSAApplication(
  appId: string,
  { adminUserId, adminNotes }: ReviewActionInput
): Promise<{ application: IDSAApplication; temporaryPassword: string }> {
  const app = await getDSAApplication(appId);

  if (app.status === ApplicationStatus.APPROVED) {
    const err: any = new Error('This application has already been approved');
    err.statusCode = 409;
    throw err;
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

  let user = await User.findOne({ email: app.email });

  if (user) {
    user.role = UserRole.DSA;
    user.accountStatus = AccountStatus.ACTIVE;
    user.name = app.applicantName;
    user.phone = app.phone;
    user.passwordHash = passwordHash;
    user.mustChangePassword = true;
    await user.save();
  } else {
    user = await User.create({
      name: app.applicantName,
      email: app.email,
      phone: app.phone,
      passwordHash,
      role: UserRole.DSA,
      accountStatus: AccountStatus.ACTIVE,
      mustChangePassword: true,
    });
  }

  app.status = ApplicationStatus.APPROVED;
  app.adminNotes = adminNotes;
  app.reviewedAt = new Date();
  app.reviewedBy = new mongoose.Types.ObjectId(adminUserId);
  app.userId = user._id;
  await app.save();

  return { application: app, temporaryPassword };
}

// ─── Reject ───────────────────────────────────────────────────────────────────

export async function rejectBuilderApplication(
  appId: string,
  { adminUserId, adminNotes }: ReviewActionInput
): Promise<IBuilderApplication> {
  const app = await getBuilderApplication(appId);

  if (app.status === ApplicationStatus.APPROVED) {
    const err: any = new Error('Cannot reject an already approved application');
    err.statusCode = 409;
    throw err;
  }

  app.status = ApplicationStatus.REJECTED;
  app.adminNotes = adminNotes;
  app.reviewedAt = new Date();
  app.reviewedBy = new mongoose.Types.ObjectId(adminUserId);
  await app.save();

  return app;
}

export async function rejectDSAApplication(
  appId: string,
  { adminUserId, adminNotes }: ReviewActionInput
): Promise<IDSAApplication> {
  const app = await getDSAApplication(appId);

  if (app.status === ApplicationStatus.APPROVED) {
    const err: any = new Error('Cannot reject an already approved application');
    err.statusCode = 409;
    throw err;
  }

  app.status = ApplicationStatus.REJECTED;
  app.adminNotes = adminNotes;
  app.reviewedAt = new Date();
  app.reviewedBy = new mongoose.Types.ObjectId(adminUserId);
  await app.save();

  return app;
}

// ─── Request clarification ────────────────────────────────────────────────────

export async function requestBuilderClarification(
  appId: string,
  { adminUserId, clarificationMessage }: ReviewActionInput
): Promise<IBuilderApplication> {
  if (!clarificationMessage?.trim()) {
    const err: any = new Error('Clarification message is required');
    err.statusCode = 400;
    throw err;
  }

  const app = await getBuilderApplication(appId);

  if (app.status === ApplicationStatus.APPROVED) {
    const err: any = new Error('Cannot request clarification on an approved application');
    err.statusCode = 409;
    throw err;
  }

  app.status = ApplicationStatus.CLARIFICATION_REQUESTED;
  app.clarificationMessage = clarificationMessage.trim();
  app.reviewedAt = new Date();
  app.reviewedBy = new mongoose.Types.ObjectId(adminUserId);
  await app.save();

  return app;
}

export async function requestDSAClarification(
  appId: string,
  { adminUserId, clarificationMessage }: ReviewActionInput
): Promise<IDSAApplication> {
  if (!clarificationMessage?.trim()) {
    const err: any = new Error('Clarification message is required');
    err.statusCode = 400;
    throw err;
  }

  const app = await getDSAApplication(appId);

  if (app.status === ApplicationStatus.APPROVED) {
    const err: any = new Error('Cannot request clarification on an approved application');
    err.statusCode = 409;
    throw err;
  }

  app.status = ApplicationStatus.CLARIFICATION_REQUESTED;
  app.clarificationMessage = clarificationMessage.trim();
  app.reviewedAt = new Date();
  app.reviewedBy = new mongoose.Types.ObjectId(adminUserId);
  await app.save();

  return app;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generates a secure random temporary password.
 * Format: Plinth + 8 random hex chars  e.g. "Plinth4a9f2c1b"
 * Meets the signup password policy (uppercase + number).
 * Admin must communicate this to the applicant securely.
 * Email notification will be added in a later phase.
 */
function generateTemporaryPassword(): string {
  const random = crypto.randomBytes(8).toString('hex'); // 16 hex chars
  return `Plinth${random}`;
}
