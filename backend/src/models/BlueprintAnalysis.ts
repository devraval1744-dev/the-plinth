import mongoose, { Document, Schema } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum AnalysisStatus {
  NOT_STARTED       = 'NOT_STARTED',
  QUEUED            = 'QUEUED',
  PROCESSING        = 'PROCESSING',
  STRUCTURE_EXTRACTED = 'STRUCTURE_EXTRACTED',
  COMPLETED         = 'COMPLETED',
  FAILED            = 'FAILED',
  NEEDS_REVIEW      = 'NEEDS_REVIEW',
}

// ─── Spatial sub-types (mirror the AI service schema) ────────────────────────

export interface SpatialRoom {
  id: string; name: string; type: string;
  x: number; y: number; width: number; height: number;
  area_sqft?: number;
}
export interface SpatialWall {
  id: string;
  start_x: number; start_y: number; end_x: number; end_y: number;
  thickness: number;
}
export interface SpatialDoor {
  id: string; x: number; y: number; width: number;
  orientation: string; connects_to?: string;
}
export interface SpatialWindow {
  id: string; x: number; y: number; width: number;
  orientation: string; connects_to?: string;
}
export interface SpatialBalcony {
  id: string; x: number; y: number; width: number; height: number;
}

export interface SpatialAnalysis {
  blueprint_id:      string;
  unit_type?:        string;
  blueprint_version: number;
  provider:          string;
  is_demo:           boolean;
  canvas_width:      number;
  canvas_height:     number;
  rooms:     SpatialRoom[];
  walls:     SpatialWall[];
  doors:     SpatialDoor[];
  windows:   SpatialWindow[];
  balconies: SpatialBalcony[];
}

// ─── Main interface ───────────────────────────────────────────────────────────

export interface IBlueprintAnalysis extends Document {
  _id:              mongoose.Types.ObjectId;
  blueprintId:      mongoose.Types.ObjectId;
  propertyId:       mongoose.Types.ObjectId;
  builderId:        mongoose.Types.ObjectId;
  unitType?:        string;
  blueprintVersion: number;   // Locked at analysis time — version-safe
  provider:         string;
  isDemo:           boolean;
  status:           AnalysisStatus;
  analysis?:        SpatialAnalysis;
  errorMessage?:    string;
  startedAt?:       Date;
  completedAt?:     Date;
  createdAt:        Date;
  updatedAt:        Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const BlueprintAnalysisSchema = new Schema<IBlueprintAnalysis>(
  {
    blueprintId:  { type: Schema.Types.ObjectId, ref: 'Blueprint', required: true, index: true },
    propertyId:   { type: Schema.Types.ObjectId, ref: 'Property',  required: true, index: true },
    builderId:    { type: Schema.Types.ObjectId, ref: 'User',      required: true },
    unitType:     { type: String, trim: true },
    blueprintVersion: { type: Number, required: true },
    provider:     { type: String, required: true, default: 'demo' },
    isDemo:       { type: Boolean, default: true },
    status:       { type: String, enum: Object.values(AnalysisStatus), default: AnalysisStatus.NOT_STARTED, index: true },
    analysis:     { type: Schema.Types.Mixed },
    errorMessage: { type: String, trim: true },
    startedAt:    { type: Date },
    completedAt:  { type: Date },
  },
  { timestamps: true }
);

// One analysis record per (blueprintId + version) pair — prevents stale results
BlueprintAnalysisSchema.index({ blueprintId: 1, blueprintVersion: 1 }, { unique: true });
BlueprintAnalysisSchema.index({ propertyId: 1, status: 1 });

export const BlueprintAnalysis = mongoose.model<IBlueprintAnalysis>(
  'BlueprintAnalysis',
  BlueprintAnalysisSchema
);
