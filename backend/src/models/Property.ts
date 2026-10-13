import mongoose, { Document, Schema } from 'mongoose';

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum PropertyStatus {
  DRAFT             = 'DRAFT',
  SUBMITTED         = 'SUBMITTED',
  APPROVED          = 'APPROVED',
  REJECTED          = 'REJECTED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
}

export enum PropertyType {
  APARTMENT    = 'Apartment',
  VILLA        = 'Villa',
  BUNGALOW     = 'Bungalow',
  PENTHOUSE    = 'Penthouse',
  STUDIO       = 'Studio',
  PLOT         = 'Plot',
  COMMERCIAL   = 'Commercial',
  OFFICE       = 'Office',
  SHOP         = 'Shop',
  WAREHOUSE    = 'Warehouse',
}

export enum ConstructionStatus {
  UNDER_CONSTRUCTION = 'Under Construction',
  READY_TO_MOVE      = 'Ready to Move',
  NEW_LAUNCH         = 'New Launch',
  COMPLETED          = 'Completed',
}

export enum BHKType {
  STUDIO = 'Studio',
  ONE_BHK    = '1 BHK',
  ONE_FIVE_BHK = '1.5 BHK',
  TWO_BHK    = '2 BHK',
  TWO_FIVE_BHK = '2.5 BHK',
  THREE_BHK  = '3 BHK',
  FOUR_BHK   = '4 BHK',
  FIVE_BHK   = '5 BHK',
  FIVE_PLUS  = '5+ BHK',
}

// ─── Sub-document interfaces ──────────────────────────────────────────────────

export interface IBHKConfig {
  type: string;        // e.g. "2 BHK"
  areaSqFt: number;
  priceMin: number;
  priceMax: number;
  totalUnits: number;
  availableUnits: number;
}

export interface IPropertyImage {
  url: string;         // storage path / URL
  caption?: string;
  isPrimary: boolean;
  uploadedAt: Date;
}

export interface IPropertyDocument {
  name: string;
  fileType: string;    // e.g. "application/pdf"
  url: string;
  isPublic: boolean;   // false = admin-only, true = visible to approved customers
  uploadedAt: Date;
}

// ─── Main interface ───────────────────────────────────────────────────────────

export interface IProperty extends Document {
  _id: mongoose.Types.ObjectId;

  // Ownership
  builderId: mongoose.Types.ObjectId;

  // Identity
  title: string;
  projectName: string;
  description: string;
  propertyType: string;

  // Location
  locality: string;
  city: string;
  state: string;
  address: string;
  latitude?: number;
  longitude?: number;

  // Configuration
  bhkConfigurations: IBHKConfig[];
  minPrice: number;
  maxPrice: number;
  minArea: number;
  maxArea: number;
  totalUnits: number;
  availableUnits: number;

  // Project info
  constructionStatus: string;
  possessionDate?: Date;
  amenities: string[];

  // Media & documents
  coverImageUrl?: string;
  images: IPropertyImage[];
  documents: IPropertyDocument[];

  // Lifecycle
  status: PropertyStatus;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  adminNotes?: string;
  rejectionReason?: string;

  // Re-approval tracking: set true when an APPROVED property is edited and submitted for re-review.
  // While true, the live public snapshot (approvedSnapshot) is served to customers instead of
  // the current (pending) fields. Cleared once admin approves the updated version.
  pendingReApproval: boolean;
  approvedSnapshot?: {
    title: string;
    projectName: string;
    description: string;
    propertyType: string;
    locality: string;
    city: string;
    state: string;
    address: string;
    latitude?: number;
    longitude?: number;
    bhkConfigurations: IBHKConfig[];
    minPrice: number;
    maxPrice: number;
    minArea: number;
    maxArea: number;
    totalUnits: number;
    availableUnits: number;
    constructionStatus: string;
    possessionDate?: Date;
    amenities: string[];
    coverImageUrl?: string;
    images: IPropertyImage[];
  };

  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const BHKConfigSchema = new Schema<IBHKConfig>(
  {
    type: { type: String, required: true, trim: true },
    areaSqFt: { type: Number, required: true, min: 0 },
    priceMin: { type: Number, required: true, min: 0 },
    priceMax: { type: Number, required: true, min: 0 },
    totalUnits: { type: Number, required: true, min: 0 },
    availableUnits: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const PropertyImageSchema = new Schema<IPropertyImage>(
  {
    url: { type: String, required: true },
    caption: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const PropertyDocumentSchema = new Schema<IPropertyDocument>(
  {
    name: { type: String, required: true, trim: true },
    fileType: { type: String, required: true },
    url: { type: String, required: true },
    isPublic: { type: Boolean, default: false },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

// ─── Main schema ──────────────────────────────────────────────────────────────

const PropertySchema = new Schema<IProperty>(
  {
    builderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: [true, 'Property title is required'],
      trim: true,
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [200, 'Title must not exceed 200 characters'],
    },
    projectName: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      minlength: [2, 'Project name must be at least 2 characters'],
      maxlength: [200, 'Project name must not exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [50, 'Description must be at least 50 characters'],
      maxlength: [5000, 'Description must not exceed 5000 characters'],
    },
    propertyType: {
      type: String,
      required: [true, 'Property type is required'],
      enum: {
        values: Object.values(PropertyType),
        message: 'Invalid property type',
      },
    },

    locality: {
      type: String,
      required: [true, 'Locality is required'],
      trim: true,
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
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: [500, 'Address too long'],
    },
    latitude: { type: Number },
    longitude: { type: Number },

    bhkConfigurations: {
      type: [BHKConfigSchema],
      default: [],
    },
    minPrice: {
      type: Number,
      required: [true, 'Minimum price is required'],
      min: [0, 'Price cannot be negative'],
    },
    maxPrice: {
      type: Number,
      required: [true, 'Maximum price is required'],
      min: [0, 'Price cannot be negative'],
    },
    minArea: {
      type: Number,
      required: [true, 'Minimum area is required'],
      min: [0, 'Area cannot be negative'],
    },
    maxArea: {
      type: Number,
      required: [true, 'Maximum area is required'],
      min: [0, 'Area cannot be negative'],
    },
    totalUnits: {
      type: Number,
      required: [true, 'Total units is required'],
      min: [1, 'Must have at least 1 unit'],
    },
    availableUnits: {
      type: Number,
      required: [true, 'Available units is required'],
      min: [0, 'Cannot be negative'],
    },

    constructionStatus: {
      type: String,
      required: [true, 'Construction status is required'],
      enum: {
        values: Object.values(ConstructionStatus),
        message: 'Invalid construction status',
      },
    },
    possessionDate: { type: Date },
    amenities: { type: [String], default: [] },

    coverImageUrl: { type: String, trim: true },
    images: { type: [PropertyImageSchema], default: [] },
    documents: { type: [PropertyDocumentSchema], default: [] },

    status: {
      type: String,
      enum: Object.values(PropertyStatus),
      default: PropertyStatus.DRAFT,
      index: true,
    },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    adminNotes: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },

    // Re-approval: preserves the last publicly-approved data while a new edit is under review
    pendingReApproval: { type: Boolean, default: false },
    approvedSnapshot: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

PropertySchema.index({ builderId: 1, status: 1 });
PropertySchema.index({ status: 1, locality: 1 });
PropertySchema.index({ status: 1, city: 1 });
PropertySchema.index({ status: 1, propertyType: 1 });
PropertySchema.index({ status: 1, minPrice: 1, maxPrice: 1 });
PropertySchema.index({ status: 1, createdAt: -1 });
PropertySchema.index({ projectName: 'text', title: 'text', locality: 'text', description: 'text' });

// ─── Model ────────────────────────────────────────────────────────────────────

export const Property = mongoose.model<IProperty>('Property', PropertySchema);
