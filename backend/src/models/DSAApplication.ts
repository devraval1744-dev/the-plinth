import mongoose, { Document, Schema } from 'mongoose';
import { ApplicationStatus } from './BuilderApplication';

// Re-export for convenience
export { ApplicationStatus };

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IDSAApplication extends Document {
  _id: mongoose.Types.ObjectId;

  // Applicant info
  applicantName: string;
  email: string;
  phone: string;

  // DSA-specific
  firmName?: string;               // Name of firm/organisation (if applicable)
  employmentType: string;          // 'Self-Employed' | 'Employed' | 'Freelance'
  yearsOfExperience: number;
  currentOrganization?: string;
  areasOfOperation: string[];      // Localities/areas they operate in
  bankPartnerships?: string;       // Banks/NBFCs they already work with
  address: string;
  city: string;
  state: string;
  description: string;             // Brief about their work and expertise

  // Application lifecycle
  status: ApplicationStatus;
  adminNotes?: string;
  clarificationMessage?: string;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;

  // Linked user account (set on approval)
  userId?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const DSAApplicationSchema = new Schema<IDSAApplication>(
  {
    applicantName: {
      type: String,
      required: [true, 'Applicant name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name must not exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian mobile number'],
    },
    firmName: {
      type: String,
      trim: true,
      maxlength: [200, 'Firm name must not exceed 200 characters'],
    },
    employmentType: {
      type: String,
      required: [true, 'Employment type is required'],
      enum: {
        values: ['Self-Employed', 'Employed', 'Freelance'],
        message: 'Invalid employment type',
      },
    },
    yearsOfExperience: {
      type: Number,
      required: [true, 'Years of experience is required'],
      min: [0, 'Cannot be negative'],
      max: [60, 'Please enter a realistic value'],
    },
    currentOrganization: {
      type: String,
      trim: true,
    },
    areasOfOperation: {
      type: [String],
      default: [],
    },
    bankPartnerships: {
      type: String,
      trim: true,
      maxlength: [500, 'Too long'],
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: [500, 'Address too long'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Brief description is required'],
      trim: true,
      minlength: [50, 'Description must be at least 50 characters'],
      maxlength: [2000, 'Description must not exceed 2000 characters'],
    },
    status: {
      type: String,
      enum: Object.values(ApplicationStatus),
      default: ApplicationStatus.PENDING,
    },
    adminNotes: { type: String, trim: true },
    clarificationMessage: { type: String, trim: true },
    reviewedAt: Date,
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

DSAApplicationSchema.index({ email: 1 });
DSAApplicationSchema.index({ status: 1 });
DSAApplicationSchema.index({ createdAt: -1 });

// ─── Model ───────────────────────────────────────────────────────────────────

export const DSAApplication = mongoose.model<IDSAApplication>(
  'DSAApplication',
  DSAApplicationSchema
);
