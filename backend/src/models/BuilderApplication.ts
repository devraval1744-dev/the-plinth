import mongoose, { Document, Schema } from 'mongoose';

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum ApplicationStatus {
  PENDING                = 'PENDING',
  APPROVED               = 'APPROVED',
  REJECTED               = 'REJECTED',
  CLARIFICATION_REQUESTED = 'CLARIFICATION_REQUESTED',
}

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IBuilderApplication extends Document {
  _id: mongoose.Types.ObjectId;

  // Applicant info
  applicantName: string;
  email: string;
  phone: string;

  // Builder-specific
  companyName: string;
  businessType: string;          // e.g. "Private Limited", "Partnership", "Proprietorship"
  yearsOfExperience: number;
  numberOfProjects: number;
  reraRegistrationNumber?: string;
  officeAddress: string;
  city: string;
  state: string;
  website?: string;
  description: string;           // Brief about the company/work

  // Application lifecycle
  status: ApplicationStatus;
  adminNotes?: string;
  clarificationMessage?: string;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId; // Admin user id

  // Linked user account (set on approval)
  userId?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const BuilderApplicationSchema = new Schema<IBuilderApplication>(
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
    companyName: {
      type: String,
      required: [true, 'Company / builder name is required'],
      trim: true,
      maxlength: [200, 'Company name must not exceed 200 characters'],
    },
    businessType: {
      type: String,
      required: [true, 'Business type is required'],
      enum: {
        values: ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship', 'Other'],
        message: 'Invalid business type',
      },
    },
    yearsOfExperience: {
      type: Number,
      required: [true, 'Years of experience is required'],
      min: [0, 'Years of experience cannot be negative'],
      max: [100, 'Please enter a realistic value'],
    },
    numberOfProjects: {
      type: Number,
      required: [true, 'Number of completed projects is required'],
      min: [0, 'Cannot be negative'],
    },
    reraRegistrationNumber: {
      type: String,
      trim: true,
    },
    officeAddress: {
      type: String,
      required: [true, 'Office address is required'],
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
    website: {
      type: String,
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
    adminNotes: {
      type: String,
      trim: true,
    },
    clarificationMessage: {
      type: String,
      trim: true,
    },
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

BuilderApplicationSchema.index({ email: 1 });
BuilderApplicationSchema.index({ status: 1 });
BuilderApplicationSchema.index({ createdAt: -1 });

// ─── Model ───────────────────────────────────────────────────────────────────

export const BuilderApplication = mongoose.model<IBuilderApplication>(
  'BuilderApplication',
  BuilderApplicationSchema
);
