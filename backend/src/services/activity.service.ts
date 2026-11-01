import mongoose from 'mongoose';
import { UserActivity, ActivityType, ISearchQuery } from '../models/UserActivity';
import { listPublicByIds, PublicProperty } from './property.service';

const VIEW_DEDUPE_MS = 30 * 60 * 1000;   // re-opening within 30 min is one "view"
const SEARCH_DEDUPE_MS = 10 * 60 * 1000; // identical search within 10 min is one search

const oid = (id: string) => new mongoose.Types.ObjectId(id);

// ─── Recording ────────────────────────────────────────────────────────────────

export async function recordView(userId: string, propertyId: string): Promise<void> {
  const touched = await UserActivity.findOneAndUpdate(
    {
      userId: oid(userId),
      type: ActivityType.VIEW,
      propertyId: oid(propertyId),
      createdAt: { $gte: new Date(Date.now() - VIEW_DEDUPE_MS) },
    },
    { $set: { createdAt: new Date() } }
  );
  if (!touched) {
    await UserActivity.create({ userId: oid(userId), type: ActivityType.VIEW, propertyId: oid(propertyId) });
  }
}

/** One-off events attached to a property (SAVE / VISIT / LOAN). */
export async function recordPropertyEvent(
  userId: string,
  type: ActivityType.SAVE | ActivityType.VISIT | ActivityType.LOAN,
  propertyId: string
): Promise<void> {
  await UserActivity.create({ userId: oid(userId), type, propertyId: oid(propertyId) });
}

/** Un-saving a property withdraws the positive signal it created. */
export async function removeSaveEvents(userId: string, propertyId: string): Promise<void> {
  await UserActivity.deleteMany({
    userId: oid(userId),
    type: ActivityType.SAVE,
    propertyId: oid(propertyId),
  });
}

const cleanText = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

const cleanNumber = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Keep only the recognised, non-empty search dimensions. Returns null if nothing meaningful. */
export function normalizeSearch(raw: Record<string, unknown> | undefined): ISearchQuery | null {
  if (!raw || typeof raw !== 'object') return null;
  const q: ISearchQuery = {
    search: cleanText(raw.search),
    locality: cleanText(raw.locality, 60),
    propertyType: cleanText(raw.propertyType, 40),
    bhk: cleanText(raw.bhk, 20),
    minPrice: cleanNumber(raw.minPrice),
    maxPrice: cleanNumber(raw.maxPrice),
    constructionStatus: cleanText(raw.constructionStatus, 40),
  };
  const entries = Object.entries(q).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries) as ISearchQuery;
}

function searchSignature(q: ISearchQuery): string {
  return JSON.stringify(
    Object.entries(q)
      .map(([k, v]) => [k, typeof v === 'string' ? v.toLowerCase() : v])
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
  );
}

/** Returns true when a new search event was stored (false when ignored / de-duplicated). */
export async function recordSearch(userId: string, raw: Record<string, unknown> | undefined): Promise<boolean> {
  const query = normalizeSearch(raw);
  if (!query) return false;
  const signature = searchSignature(query);

  const touched = await UserActivity.findOneAndUpdate(
    {
      userId: oid(userId),
      type: ActivityType.SEARCH,
      signature,
      createdAt: { $gte: new Date(Date.now() - SEARCH_DEDUPE_MS) },
    },
    { $set: { createdAt: new Date() } }
  );
  if (touched) return false;

  await UserActivity.create({ userId: oid(userId), type: ActivityType.SEARCH, query, signature });
  return true;
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export interface RecentSearch {
  query: ISearchQuery;
  createdAt: Date;
}

export async function getRecentSearches(userId: string, limit = 6): Promise<RecentSearch[]> {
  const rows = await UserActivity.find({ userId: oid(userId), type: ActivityType.SEARCH })
    .sort({ createdAt: -1 })
    .limit(60)
    .lean();

  const seen = new Set<string>();
  const out: RecentSearch[] = [];
  for (const row of rows) {
    if (!row.query) continue;
    const sig = row.signature || searchSignature(row.query);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ query: row.query, createdAt: row.createdAt });
    if (out.length >= limit) break;
  }
  return out;
}

export async function getRecentViews(userId: string, limit = 8): Promise<PublicProperty[]> {
  const rows = await UserActivity.find({
    userId: oid(userId),
    type: ActivityType.VIEW,
    propertyId: { $exists: true },
  })
    .sort({ createdAt: -1 })
    .limit(80)
    .select('propertyId')
    .lean();

  const ids: string[] = [];
  for (const r of rows) {
    const id = String(r.propertyId);
    if (!ids.includes(id)) ids.push(id);
  }
  // Fetch a few extra: some may have been unpublished since
  const props = await listPublicByIds(ids.slice(0, limit + 6));
  return props.slice(0, limit);
}

/** Privacy control: forget browsing + search history (saves, visits and loan requests are records, not history). */
export async function clearBrowsingHistory(userId: string): Promise<number> {
  const res = await UserActivity.deleteMany({
    userId: oid(userId),
    type: { $in: [ActivityType.VIEW, ActivityType.SEARCH] },
  });
  return res.deletedCount;
}
