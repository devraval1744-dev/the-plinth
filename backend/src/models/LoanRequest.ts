import mongoose, { Document, Schema } from 'mongoose';

/**
 * A customer's request to be connected with a DSA partner. The DSA handles everything
 * about the loan itself — the platform only captures contact details and consent.
 * (Named LoanRequest for historical reasons.)
 */
export enum LoanStatus {
  SUBMITTED          = 'SUBMITTED',           // received, waiting for a DSA to be assigned
  ASSIGNED           = 'ASSIGNED',            // routed to a DSA, not yet worked
  IN_PROGRESS        = 'IN_PROGRESS',
  DOCUMENTS_REQUIRED = 'DOCUMENTS_REQUIRED',
  COMPLETED          = 'COMPLETED',           // DSA finished assisting
  CLOSED             = 'CLOSED',              // not proceeding
  CANCELLED          = 'CANCELLED',           // withdrawn by the customer
}

export const OPEN_LOAN_STATUSES: LoanStatus[] = [
  LoanStatus.SUBMITTED,
  LoanStatus.ASSIGNED,
  LoanStatus.IN_PROGRESS,
  LoanStatus.DOCUMENTS_REQUIRED,
];

/** Statuses a DSA is allowed to move a lead into. */
export const DSA_SETTABLE_STATUSES: LoanStatus[] = [
  LoanStatus.IN_PROGRESS,
  LoanStatus.DOCUMENTS_REQUIRED,
  LoanStatus.COMPLETED,
  LoanStatus.CLOSED,
];

export interface ILoanRequest extends Document {
  _id: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  dsaId?: mongoose.Types.ObjectId;

  contactName: string;
  contactPhone: string;
  notes?: string;

  /** Customer must explicitly consent to their details being shared with a DSA. */
  consentGiven: boolean;
  consentAt: Date;

  status: LoanStatus;
  dsaNote?: string;
  assignedAt?: Date;
  statusUpdatedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const LoanRequestSchema = new Schema<ILoanRequest>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property' },
    dsaId: { type: Schema.Types.ObjectId, ref: 'User' },

    contactName: { type: String, required: true, trim: true, maxlength: 100 },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian mobile number'],
    },
    notes: { type: String, trim: true, maxlength: 500 },

    consentGiven: { type: Boolean, required: true },
    consentAt: { type: Date, required: true },

    status: { type: String, enum: Object.values(LoanStatus), default: LoanStatus.SUBMITTED },
    dsaNote: { type: String, trim: true, maxlength: 500 },
    assignedAt: { type: Date },
    statusUpdatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

LoanRequestSchema.index({ customerId: 1, createdAt: -1 });
LoanRequestSchema.index({ dsaId: 1, status: 1, createdAt: -1 });
LoanRequestSchema.index({ status: 1, createdAt: 1 });
LoanRequestSchema.index({ customerId: 1, propertyId: 1, status: 1 });

export const LoanRequest = mongoose.model<ILoanRequest>('LoanRequest', LoanRequestSchema);
