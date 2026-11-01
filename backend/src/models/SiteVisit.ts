import mongoose, { Document, Schema } from 'mongoose';

export enum VisitStatus {
  PENDING             = 'PENDING',              // waiting for the builder
  CONFIRMED           = 'CONFIRMED',
  RESCHEDULE_PROPOSED = 'RESCHEDULE_PROPOSED',  // builder suggested another date/slot
  DECLINED            = 'DECLINED',
  CANCELLED           = 'CANCELLED',            // cancelled by the customer
  COMPLETED           = 'COMPLETED',
}

export enum VisitSlot {
  MORNING   = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  EVENING   = 'EVENING',
}

export const VISIT_SLOT_LABELS: Record<VisitSlot, string> = {
  [VisitSlot.MORNING]:   '10:00 AM – 12:00 PM',
  [VisitSlot.AFTERNOON]: '12:00 PM – 4:00 PM',
  [VisitSlot.EVENING]:   '4:00 PM – 7:00 PM',
};

/** Statuses that still occupy the customer's "one live request per property" slot. */
export const OPEN_VISIT_STATUSES: VisitStatus[] = [
  VisitStatus.PENDING,
  VisitStatus.CONFIRMED,
  VisitStatus.RESCHEDULE_PROPOSED,
];

export interface ISiteVisit extends Document {
  _id: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  builderId: mongoose.Types.ObjectId;

  /** Calendar date stored at 00:00 UTC (date-only semantics, shown in UTC). */
  visitDate: Date;
  timeSlot: VisitSlot;
  visitors: number;
  contactName: string;
  contactPhone: string;
  notes?: string;

  /** Set while status is RESCHEDULE_PROPOSED; promoted to visitDate/timeSlot when the customer accepts. */
  proposedDate?: Date;
  proposedSlot?: VisitSlot;

  status: VisitStatus;
  builderNote?: string;
  respondedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const SiteVisitSchema = new Schema<ISiteVisit>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    builderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    visitDate: { type: Date, required: true },
    timeSlot: { type: String, enum: Object.values(VisitSlot), required: true },
    visitors: { type: Number, required: true, min: 1, max: 10, default: 1 },
    contactName: { type: String, required: true, trim: true, maxlength: 100 },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian mobile number'],
    },
    notes: { type: String, trim: true, maxlength: 500 },

    proposedDate: { type: Date },
    proposedSlot: { type: String, enum: Object.values(VisitSlot) },

    status: { type: String, enum: Object.values(VisitStatus), default: VisitStatus.PENDING },
    builderNote: { type: String, trim: true, maxlength: 500 },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);

SiteVisitSchema.index({ customerId: 1, createdAt: -1 });
SiteVisitSchema.index({ builderId: 1, status: 1, visitDate: 1 });
SiteVisitSchema.index({ propertyId: 1, customerId: 1, status: 1 });

export const SiteVisit = mongoose.model<ISiteVisit>('SiteVisit', SiteVisitSchema);
