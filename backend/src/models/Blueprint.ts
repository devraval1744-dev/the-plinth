import mongoose, { Document, Schema } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum BlueprintLevel {
  PROPERTY = 'PROPERTY', // Full site/project blueprint
  UNIT     = 'UNIT',     // Individual unit-type blueprint
}

export enum BlueprintType {
  SITE_PLAN        = 'Site Plan',
  FLOOR_PLAN       = 'Floor Plan',
  UNIT_PLAN        = 'Unit Plan',
  ELEVATION        = 'Elevation',
  SECTION          = 'Section',
  ELECTRICAL       = 'Electrical Layout',
  PLUMBING         = 'Plumbing Layout',
  OTHER            = 'Other',
}

export enum BlueprintStatus {
  ACTIVE   = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IBlueprint extends Document {
  _id: mongoose.Types.ObjectId;
  propertyId:  mongoose.Types.ObjectId;
  builderId:   mongoose.Types.ObjectId;

  // Classification
  level:         BlueprintLevel;
  blueprintType: string;

  // Unit-specific (required when level = UNIT)
  unitType?:  string; // e.g. "2 BHK"
  unitLabel?: string; // e.g. "Type A"  — allows multiple configs per BHK type

  // Display
  title:       string;
  description?: string;

  // File
  fileUrl:      string;
  fileName:     string;
  fileMimeType: string;
  fileSizeBytes: number;

  // Versioning
  version: number;
  status:  BlueprintStatus;

  // Audit
  uploadedBy: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const BlueprintSchema = new Schema<IBlueprint>(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    builderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    level: {
      type: String,
      enum: Object.values(BlueprintLevel),
      required: true,
    },
    blueprintType: {
      type: String,
      enum: [...Object.values(BlueprintType)],
      required: true,
    },

    unitType: {
      type: String,
      trim: true,
    },
    unitLabel: {
      type: String,
      trim: true,
    },

    title: {
      type: String,
      required: [true, 'Blueprint title is required'],
      trim: true,
      maxlength: [200, 'Title must not exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description must not exceed 1000 characters'],
    },

    fileUrl:       { type: String, required: true },
    fileName:      { type: String, required: true, trim: true },
    fileMimeType:  { type: String, required: true },
    fileSizeBytes: { type: Number, required: true, min: 0 },

    version: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    status: {
      type: String,
      enum: Object.values(BlueprintStatus),
      default: BlueprintStatus.ACTIVE,
      index: true,
    },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Active blueprints per property
BlueprintSchema.index({ propertyId: 1, status: 1 });
// Active blueprint for a specific unit config (enforces one active per slot)
BlueprintSchema.index({ propertyId: 1, level: 1, unitType: 1, unitLabel: 1, status: 1 });
// Version history for a slot
BlueprintSchema.index({ propertyId: 1, level: 1, unitType: 1, unitLabel: 1, version: 1 });

// ─── Model ────────────────────────────────────────────────────────────────────

export const Blueprint = mongoose.model<IBlueprint>('Blueprint', BlueprintSchema);
