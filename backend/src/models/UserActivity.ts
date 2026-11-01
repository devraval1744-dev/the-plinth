import mongoose, { Document, Schema } from 'mongoose';

/**
 * Behavioural signals that power recommendations, trending and the customer
 * "recently viewed / recent searches" shelves.
 *
 *  VIEW   – customer opened a property detail page
 *  SEARCH – customer ran a search / applied filters (no property attached)
 *  SAVE   – customer saved a property (removed again when un-saved)
 *  VISIT  – customer requested a site visit
 *  LOAN   – customer requested loan assistance
 */
export enum ActivityType {
  VIEW   = 'VIEW',
  SEARCH = 'SEARCH',
  SAVE   = 'SAVE',
  VISIT  = 'VISIT',
  LOAN   = 'LOAN',
}

export interface ISearchQuery {
  search?: string;
  locality?: string;
  propertyType?: string;
  bhk?: string;
  minPrice?: number;
  maxPrice?: number;
  constructionStatus?: string;
}

export interface IUserActivity extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: ActivityType;
  propertyId?: mongoose.Types.ObjectId;
  query?: ISearchQuery;
  signature?: string; // normalised search fingerprint, used for de-duplication
  createdAt: Date;
}

const SearchQuerySchema = new Schema<ISearchQuery>(
  {
    search: { type: String, trim: true, maxlength: 120 },
    locality: { type: String, trim: true },
    propertyType: { type: String, trim: true },
    bhk: { type: String, trim: true },
    minPrice: { type: Number },
    maxPrice: { type: Number },
    constructionStatus: { type: String, trim: true },
  },
  { _id: false }
);

const UserActivitySchema = new Schema<IUserActivity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(ActivityType), required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property' },
    query: { type: SearchQuerySchema },
    signature: { type: String },
    // createdAt is managed explicitly (view events are "touched" when re-opened)
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false }
);

UserActivitySchema.index({ userId: 1, createdAt: -1 });
UserActivitySchema.index({ userId: 1, type: 1, propertyId: 1, createdAt: -1 });
UserActivitySchema.index({ propertyId: 1, type: 1, createdAt: -1 });
UserActivitySchema.index({ type: 1, createdAt: -1 });
// Behavioural data expires after 180 days
UserActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const UserActivity = mongoose.model<IUserActivity>('UserActivity', UserActivitySchema);
