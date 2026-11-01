import mongoose from 'mongoose';
import { Favorite } from '../models/Favorite';
import { Property } from '../models/Property';
import { ActivityType } from '../models/UserActivity';
import { PUBLIC_FILTER, PublicProperty, listPublicByIds } from './property.service';
import { recordPropertyEvent, removeSaveEvents } from './activity.service';
import { httpError } from '../utils/httpError';

const oid = (id: string) => new mongoose.Types.ObjectId(id);

function assertValidId(id: string): void {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, 'Invalid property ID');
}

export async function addFavorite(userId: string, propertyId: string): Promise<void> {
  assertValidId(propertyId);
  const visible = await Property.exists({ $and: [PUBLIC_FILTER, { _id: propertyId }] });
  if (!visible) throw httpError(404, 'Property not found');

  // Upsert makes saving idempotent (double-clicks, retries, two tabs)
  const res = await Favorite.updateOne(
    { userId: oid(userId), propertyId: oid(propertyId) },
    { $setOnInsert: { userId: oid(userId), propertyId: oid(propertyId) } },
    { upsert: true }
  );
  if (res.upsertedCount > 0) {
    await recordPropertyEvent(userId, ActivityType.SAVE, propertyId);
  }
}

export async function removeFavorite(userId: string, propertyId: string): Promise<void> {
  assertValidId(propertyId);
  await Favorite.deleteOne({ userId: oid(userId), propertyId: oid(propertyId) });
  await removeSaveEvents(userId, propertyId);
}

export async function listFavoriteIds(userId: string): Promise<string[]> {
  const rows = await Favorite.find({ userId: oid(userId) }).sort({ createdAt: -1 }).select('propertyId').lean();
  return rows.map((r) => String(r.propertyId));
}

export type SavedProperty = PublicProperty & { savedAt: Date };

/** Saved properties (newest first). Listings that are no longer public are omitted. */
export async function listFavorites(userId: string): Promise<SavedProperty[]> {
  const rows = await Favorite.find({ userId: oid(userId) }).sort({ createdAt: -1 }).lean();
  const props = await listPublicByIds(rows.map((r) => String(r.propertyId)));
  const savedAt = new Map(rows.map((r) => [String(r.propertyId), r.createdAt]));
  return props.map((p) => ({ ...p, savedAt: savedAt.get(String(p._id)) as Date }));
}

/** Count of saved properties that are still publicly visible (matches what the Saved page lists). */
export async function countFavorites(userId: string): Promise<number> {
  const ids = await Favorite.find({ userId: oid(userId) }).distinct('propertyId');
  if (ids.length === 0) return 0;
  return Property.countDocuments({ $and: [PUBLIC_FILTER, { _id: { $in: ids } }] });
}
