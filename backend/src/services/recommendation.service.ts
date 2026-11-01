import mongoose from 'mongoose';
import { Favorite } from '../models/Favorite';
import { SiteVisit, OPEN_VISIT_STATUSES } from '../models/SiteVisit';
import { LoanRequest, OPEN_LOAN_STATUSES } from '../models/LoanRequest';
import { UserActivity, ActivityType, ISearchQuery } from '../models/UserActivity';
import {
  PublicProperty,
  getPublicProperty,
  listPublicByIds,
  listPublicProperties,
  propertyBudgetFit,
} from './property.service';

/**
 * Hybrid recommender.
 *
 *  1. PROFILE   – every customer signal (search filters, views, saves, visit & loan requests)
 *                 is weighted by intent strength and exponentially decayed with age
 *                 (14-day half-life) to build a preference profile: localities, property
 *                 types, unit sizes, construction status, builders, amenities and a budget band.
 *  2. CONTENT   – every public listing is scored against that profile.
 *  3. COLLAB    – "buyers who engaged with what you engaged with also looked at…"
 *                 (item-to-item co-engagement over the last 90 days).
 *  4. TRENDING  – a small popularity prior from the last 7 days of activity.
 *  5. RERANK    – already-saved / already-requested listings are excluded, already-viewed ones
 *                 are demoted, and a diversity penalty stops one locality flooding the feed.
 *
 * Each pick carries a match score and the top reasons behind it so the UI can explain itself.
 */

// ─── Tunables ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const LOOKBACK_DAYS = 90;
const HALF_LIFE_DAYS = 14;
const MAX_SIGNALS = 500;
const CANDIDATE_LIMIT = 400;

/** How strongly each behaviour says "I want this". */
const EVENT_WEIGHT: Record<ActivityType, number> = {
  [ActivityType.VIEW]: 1,
  [ActivityType.SEARCH]: 1.5,
  [ActivityType.SAVE]: 4,
  [ActivityType.LOAN]: 5,
  [ActivityType.VISIT]: 6,
};

/** Contribution to the global "trending" score. */
const TREND_WEIGHT: Record<string, number> = { VIEW: 1, SAVE: 3, LOAN: 4, VISIT: 5 };

type Dimension =
  | 'locality' | 'price' | 'bhk' | 'type' | 'status'
  | 'amenities' | 'builder' | 'collab' | 'popularity';

const DIM_WEIGHT: Record<Dimension, number> = {
  locality: 0.22,
  price: 0.20,
  collab: 0.15,
  bhk: 0.13,
  type: 0.09,
  amenities: 0.07,
  status: 0.05,
  popularity: 0.05,
  builder: 0.04,
};

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'near', 'with', 'flat', 'flats', 'home', 'homes', 'house', 'apartment',
  'apartments', 'bhk', 'sale', 'buy', 'property', 'properties', 'in', 'at', 'of',
]);

const oid = (id: string) => new mongoose.Types.ObjectId(id);
const norm = (s: string) => s.trim().toLowerCase();

export function formatInr(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(amount >= 100_000_000 ? 0 : 1).replace(/\.0$/, '')} Cr`;
  if (amount >= 100_000) return `₹${Math.round(amount / 100_000)} L`;
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  signalCount: number;                  // events that contributed to the profile
  totalWeight: number;                  // Σ decayed weights → confidence
  engagedIds: Set<string>;              // properties the customer has interacted with
  excludeIds: Set<string>;              // saved / visit-requested / loan-requested
  localities: Map<string, number>;      // each map is normalised so the top entry is 1
  types: Map<string, number>;
  bhks: Map<string, number>;
  statuses: Map<string, number>;
  builders: Map<string, number>;
  amenities: Map<string, number>;
  labels: Map<string, string>;          // lower-case key → display label
  budget: { min: number; max: number } | null;
  keywords: string[];
}

interface Signal {
  type: ActivityType;
  propertyId?: string;
  query?: ISearchQuery;
  at: Date;
}

function decay(at: Date, now: number): number {
  const ageDays = Math.max(0, (now - new Date(at).getTime()) / DAY_MS);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function weightedPercentile(points: Array<{ v: number; w: number }>, p: number): number {
  const sorted = [...points].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= p * total) return x.v;
  }
  return sorted[sorted.length - 1].v;
}

function normaliseMap(map: Map<string, number>): void {
  const max = Math.max(0, ...map.values());
  if (max <= 0) return;
  map.forEach((v, k) => map.set(k, v / max));
}

/**
 * @param excludePropertyId ignore signals about this listing — used when explaining a single
 *   property so merely viewing it can't inflate its own match score.
 */
export async function buildUserProfile(
  userId: string,
  opts: { excludePropertyId?: string } = {}
): Promise<UserProfile> {
  const now = Date.now();
  const since = new Date(now - LOOKBACK_DAYS * DAY_MS);
  const uid = oid(userId);

  const [events, favorites, openVisits, openLoans] = await Promise.all([
    // SAVE comes from the Favorite collection (the source of truth), not from events
    UserActivity.find({ userId: uid, createdAt: { $gte: since }, type: { $ne: ActivityType.SAVE } })
      .sort({ createdAt: -1 })
      .limit(MAX_SIGNALS)
      .lean(),
    Favorite.find({ userId: uid }).lean(),
    SiteVisit.find({ customerId: uid, status: { $in: OPEN_VISIT_STATUSES } }).select('propertyId').lean(),
    LoanRequest.find({ customerId: uid, status: { $in: OPEN_LOAN_STATUSES }, propertyId: { $exists: true } })
      .select('propertyId')
      .lean(),
  ]);

  const signals: Signal[] = [
    ...events.map((e) => ({
      type: e.type,
      propertyId: e.propertyId ? String(e.propertyId) : undefined,
      query: e.query,
      at: e.createdAt,
    })),
    ...favorites.map((f) => ({ type: ActivityType.SAVE, propertyId: String(f.propertyId), at: f.createdAt })),
  ];

  const propertyIds = [...new Set(signals.filter((s) => s.propertyId).map((s) => s.propertyId as string))];
  const props = await listPublicByIds(propertyIds);
  const byId = new Map(props.map((p) => [String(p._id), p]));

  const profile: UserProfile = {
    signalCount: 0,
    totalWeight: 0,
    engagedIds: new Set(),
    excludeIds: new Set([
      ...favorites.map((f) => String(f.propertyId)),
      ...openVisits.map((v) => String(v.propertyId)),
      ...openLoans.map((l) => String(l.propertyId)),
    ]),
    localities: new Map(),
    types: new Map(),
    bhks: new Map(),
    statuses: new Map(),
    builders: new Map(),
    amenities: new Map(),
    labels: new Map(),
    budget: null,
    keywords: [],
  };

  const bump = (map: Map<string, number>, raw: string | undefined, w: number) => {
    if (!raw || !raw.trim()) return;
    const key = norm(raw);
    if (!profile.labels.has(key)) profile.labels.set(key, raw.trim());
    map.set(key, (map.get(key) || 0) + w);
  };

  const priceLo: Array<{ v: number; w: number }> = [];
  const priceHi: Array<{ v: number; w: number }> = [];
  const keywordSet: string[] = [];

  for (const s of signals) {
    if (opts.excludePropertyId && s.propertyId === opts.excludePropertyId) continue;
    const w = EVENT_WEIGHT[s.type] * decay(s.at, now);

    if (s.type === ActivityType.SEARCH && s.query) {
      const q = s.query;
      const intent = w * 1.5; // an explicit filter is a stronger statement than a glance
      bump(profile.localities, q.locality, intent);
      bump(profile.types, q.propertyType, intent);
      bump(profile.bhks, q.bhk, intent);
      bump(profile.statuses, q.constructionStatus, intent);
      if (q.maxPrice !== undefined || q.minPrice !== undefined) {
        const hi = q.maxPrice ?? (q.minPrice as number) * 2.5;
        const lo = q.minPrice ?? hi * 0.4;
        priceLo.push({ v: lo, w: intent });
        priceHi.push({ v: hi, w: intent });
      }
      if (q.search && keywordSet.length < 8) {
        for (const tok of q.search.toLowerCase().split(/[^a-z0-9]+/)) {
          if (tok.length >= 3 && !STOP_WORDS.has(tok) && !keywordSet.includes(tok)) keywordSet.push(tok);
        }
      }
      profile.signalCount += 1;
      profile.totalWeight += w;
      continue;
    }

    const p = s.propertyId ? byId.get(s.propertyId) : undefined;
    if (!p) continue; // property no longer public — signal is meaningless

    profile.engagedIds.add(String(p._id));
    bump(profile.localities, p.locality, w);
    bump(profile.types, p.propertyType, w);
    bump(profile.statuses, p.constructionStatus, w);

    const bhkTypes: string[] = [...new Set<string>((p.bhkConfigurations || []).map((c: { type: string }) => c.type))];
    bhkTypes.forEach((t) => bump(profile.bhks, t, w / bhkTypes.length));

    const builderId = p.builderId && typeof p.builderId === 'object' ? p.builderId._id : p.builderId;
    if (builderId) {
      const key = String(builderId);
      profile.builders.set(key, (profile.builders.get(key) || 0) + w);
      if (p.builderId?.name) profile.labels.set(key, p.builderId.name);
    }

    (p.amenities || []).forEach((a: string) => bump(profile.amenities, a, w));

    priceLo.push({ v: p.minPrice, w });
    priceHi.push({ v: p.maxPrice, w });
    profile.signalCount += 1;
    profile.totalWeight += w;
  }

  [profile.localities, profile.types, profile.bhks, profile.statuses, profile.builders, profile.amenities]
    .forEach(normaliseMap);

  if (priceLo.length > 0) {
    const lo = weightedPercentile(priceLo, 0.15);
    const hi = Math.max(weightedPercentile(priceHi, 0.85), lo);
    // Pad the band — people browse a little above and below what they've looked at
    profile.budget = { min: Math.round(lo * 0.8), max: Math.round(hi * 1.2) };
  }
  profile.keywords = keywordSet;
  return profile;
}

// ─── Collaborative signal ─────────────────────────────────────────────────────

interface CollabEntry { score: number; anchorId: string }

async function collaborativeScores(userId: string, engagedIds: string[]): Promise<Map<string, CollabEntry>> {
  const result = new Map<string, CollabEntry>();
  if (engagedIds.length === 0) return result;

  const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
  const kinds = [ActivityType.VIEW, ActivityType.SAVE, ActivityType.VISIT, ActivityType.LOAN];
  const engagedObj = engagedIds.map(oid);

  // 1. Other customers who engaged with any of "my" properties
  const overlap = await UserActivity.find({
    propertyId: { $in: engagedObj },
    userId: { $ne: oid(userId) },
    type: { $in: kinds },
    createdAt: { $gte: since },
  })
    .select('userId propertyId')
    .limit(3000)
    .lean();

  const sharedByPeer = new Map<string, Set<string>>();
  for (const e of overlap) {
    const peer = String(e.userId);
    if (!sharedByPeer.has(peer)) sharedByPeer.set(peer, new Set());
    sharedByPeer.get(peer)!.add(String(e.propertyId));
  }
  if (sharedByPeer.size === 0) return result;

  // 2. What else did those customers engage with?
  const peerIds = [...sharedByPeer.keys()].slice(0, 300).map(oid);
  const others = await UserActivity.find({
    userId: { $in: peerIds },
    propertyId: { $exists: true, $nin: engagedObj },
    type: { $in: kinds },
    createdAt: { $gte: since },
  })
    .select('userId propertyId type')
    .limit(6000)
    .lean();

  for (const e of others) {
    const shared = sharedByPeer.get(String(e.userId));
    if (!shared) continue;
    const similarity = shared.size / engagedIds.length; // share of my history this peer also touched
    const pid = String(e.propertyId);
    const entry = result.get(pid) || { score: 0, anchorId: [...shared][0] };
    entry.score += similarity * EVENT_WEIGHT[e.type];
    result.set(pid, entry);
  }

  const max = Math.max(0, ...[...result.values()].map((v) => v.score));
  if (max > 0) result.forEach((v) => { v.score /= max; });
  return result;
}

// ─── Trending ─────────────────────────────────────────────────────────────────

export interface TrendInfo { score: number; viewers: number }

export async function getTrendingInfo(days = 7): Promise<Map<string, TrendInfo>> {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows: Array<{ _id: mongoose.Types.ObjectId; score: number; users: mongoose.Types.ObjectId[] }> =
    await UserActivity.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          propertyId: { $exists: true },
          type: { $in: Object.keys(TREND_WEIGHT) },
        },
      },
      {
        $group: {
          _id: '$propertyId',
          score: {
            $sum: {
              $switch: {
                branches: Object.entries(TREND_WEIGHT).map(([t, w]) => ({
                  case: { $eq: ['$type', t] },
                  then: w,
                })),
                default: 0,
              },
            },
          },
          users: { $addToSet: '$userId' },
        },
      },
    ]);
  return new Map(rows.map((r) => [String(r._id), { score: r.score, viewers: r.users.length }]));
}

export interface TrendingProperty extends PublicProperty {
  trending: { viewers: number; score: number };
}

export async function getTrendingProperties(limit = 8): Promise<{ properties: TrendingProperty[]; hasActivity: boolean }> {
  const [trend, candidates] = await Promise.all([
    getTrendingInfo(),
    listPublicProperties({}, { limit: CANDIDATE_LIMIT }),
  ]);
  const ranked = candidates
    .map((p) => ({ ...p, trending: trend.get(String(p._id)) || { viewers: 0, score: 0 } }))
    // stable: ties keep the "newest first" order from the query
    .sort((a, b) => b.trending.score - a.trending.score);
  const hasActivity = ranked.some((p) => p.trending.score > 0);
  return { properties: ranked.slice(0, limit), hasActivity };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export interface ScoreContext {
  collab: Map<string, CollabEntry>;
  trending: Map<string, TrendInfo>;
  maxTrend: number;
  nameById: Map<string, string>; // property id → project name (for "also viewed" anchors)
}

export interface Recommendation {
  property: PublicProperty;
  score: number;               // 0..1
  matchScore: number | null;   // 0..99 for display, null when not personalised
  reasons: string[];
}

function scoreCandidate(p: PublicProperty, profile: UserProfile, ctx: ScoreContext): Recommendation {
  const id = String(p._id);
  const builderKey = String(p.builderId && typeof p.builderId === 'object' ? p.builderId._id : p.builderId);
  const f: Record<Dimension, number | null> = {
    locality: null, price: null, bhk: null, type: null, status: null,
    amenities: null, builder: null, collab: null, popularity: null,
  };
  let bestBhk = '';
  let sharedAmenities: string[] = [];

  if (profile.localities.size) f.locality = profile.localities.get(norm(p.locality)) ?? 0;
  if (profile.types.size) f.type = profile.types.get(norm(p.propertyType)) ?? 0;
  if (profile.statuses.size) f.status = profile.statuses.get(norm(p.constructionStatus)) ?? 0;
  if (profile.builders.size) f.builder = profile.builders.get(builderKey) ?? 0;
  if (profile.budget) f.price = propertyBudgetFit(p, profile.budget);

  if (profile.bhks.size) {
    f.bhk = 0;
    for (const c of p.bhkConfigurations || []) {
      const v = profile.bhks.get(norm(c.type)) ?? 0;
      if (v > (f.bhk as number)) { f.bhk = v; bestBhk = c.type; }
    }
  }

  if (profile.amenities.size) {
    sharedAmenities = (p.amenities || []).filter((a: string) => profile.amenities.has(norm(a)));
    const sum = sharedAmenities.reduce((s: number, a: string) => s + (profile.amenities.get(norm(a)) || 0), 0);
    f.amenities = Math.min(1, sum / Math.min(6, Math.max(1, (p.amenities || []).length)));
  }

  if (ctx.collab.size) f.collab = ctx.collab.get(id)?.score ?? 0;
  if (ctx.trending.size && ctx.maxTrend > 0) f.popularity = (ctx.trending.get(id)?.score ?? 0) / ctx.maxTrend;

  let num = 0;
  let den = 0;
  (Object.keys(f) as Dimension[]).forEach((d) => {
    const v = f[d];
    if (v === null) return; // no signal for this dimension → don't penalise
    num += DIM_WEIGHT[d] * v;
    den += DIM_WEIGHT[d];
  });
  let score = den > 0 ? num / den : 0;

  // Keyword hits from free-text searches ("lake view", a project name…)
  const haystack = `${p.projectName} ${p.title} ${p.locality}`.toLowerCase();
  if (profile.keywords.some((k) => haystack.includes(k))) score += 0.08;

  if (!(p.availableUnits > 0)) score *= 0.55;                 // sold out → rarely worth showing
  if (profile.engagedIds.has(id)) score *= 0.8;               // seen it already → prefer fresh options
  score = Math.max(0, Math.min(1, score));

  // ── Human-readable reasons, strongest contribution first ──
  const budget = profile.budget;
  const cand: Array<{ weight: number; text: string }> = [];
  const add = (d: Dimension, threshold: number, text: () => string) => {
    const v = f[d];
    if (v !== null && v >= threshold) cand.push({ weight: DIM_WEIGHT[d] * v, text: text() });
  };
  add('locality', 0.5, () => `You've been exploring ${p.locality}`);
  add('price', 0.7, () => `Fits your budget (${formatInr(budget!.min)} – ${formatInr(budget!.max)})`);
  add('bhk', 0.5, () => `Offers ${bestBhk}, a layout you've shown interest in`);
  add('type', 0.5, () => `${p.propertyType} — a type you keep coming back to`);
  add('status', 0.6, () => `${p.constructionStatus}, like homes you've liked`);
  add('amenities', 0.35, () => `Has ${sharedAmenities.slice(0, 2).join(' & ')} you seem to value`);
  add('builder', 0.5, () => `From ${profile.labels.get(builderKey) || 'a builder'} whose projects you've viewed`);
  add('collab', 0.2, () => {
    const anchor = ctx.nameById.get(ctx.collab.get(id)?.anchorId || '');
    return anchor ? `Buyers who viewed ${anchor} also viewed this` : 'Popular with buyers who viewed similar homes';
  });
  add('popularity', 0.5, () => {
    const viewers = ctx.trending.get(id)?.viewers || 0;
    return `Trending this week${viewers > 1 ? ` — ${viewers} buyers engaged` : ''}`;
  });
  if (profile.keywords.some((k) => haystack.includes(k))) {
    cand.push({ weight: 0.05, text: 'Matches what you searched for' });
  }
  const reasons = cand.sort((a, b) => b.weight - a.weight).slice(0, 3).map((c) => c.text);

  return {
    property: p,
    score,
    matchScore: Math.min(99, Math.round(score * 100)),
    reasons: reasons.length > 0 ? reasons : ['Based on your recent activity'],
  };
}

/** Greedy re-rank: each pick from an already-represented locality is discounted by 10%. */
function diversify(scored: Recommendation[], limit: number): Recommendation[] {
  const pool = [...scored];
  const picked: Recommendation[] = [];
  const perLocality = new Map<string, number>();
  while (picked.length < limit && pool.length > 0) {
    let bestIdx = 0;
    let bestVal = -1;
    pool.forEach((r, i) => {
      const seen = perLocality.get(norm(r.property.locality)) || 0;
      const adjusted = r.score * Math.pow(0.9, seen);
      if (adjusted > bestVal) { bestVal = adjusted; bestIdx = i; }
    });
    const [next] = pool.splice(bestIdx, 1);
    picked.push(next);
    const key = norm(next.property.locality);
    perLocality.set(key, (perLocality.get(key) || 0) + 1);
  }
  return picked;
}

async function buildContext(userId: string, profile: UserProfile, candidates: PublicProperty[]): Promise<ScoreContext> {
  const [collab, trending] = await Promise.all([
    collaborativeScores(userId, [...profile.engagedIds]),
    getTrendingInfo(),
  ]);
  const nameById = new Map<string, string>(candidates.map((c) => [String(c._id), c.projectName]));
  // Anchors are properties the customer engaged with — make sure their names are resolvable
  const missing = [...collab.values()].map((c) => c.anchorId).filter((id) => !nameById.has(id));
  if (missing.length > 0) {
    (await listPublicByIds([...new Set(missing)])).forEach((p) => nameById.set(String(p._id), p.projectName));
  }
  return {
    collab,
    trending,
    maxTrend: Math.max(0, ...[...trending.values()].map((t) => t.score)),
    nameById,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ProfileInsights {
  profileStrength: number;                         // 0..100
  signalCount: number;
  topLocalities: string[];
  topTypes: string[];
  topBhks: string[];
  budget: { min: number; max: number } | null;
}

export function summariseProfile(profile: UserProfile): ProfileInsights {
  const top = (map: Map<string, number>, n: number) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => profile.labels.get(k) || k);
  return {
    profileStrength: Math.min(100, Math.round((1 - Math.exp(-profile.totalWeight / 10)) * 100)),
    signalCount: profile.signalCount,
    topLocalities: top(profile.localities, 3),
    topTypes: top(profile.types, 2),
    topBhks: top(profile.bhks, 3),
    budget: profile.budget,
  };
}

export interface RecommendationFeed {
  isPersonalized: boolean;
  items: Recommendation[];
  insights: ProfileInsights;
}

/** The "Recommended for you" feed. Falls back to trending / new launches for brand-new customers. */
export async function getRecommendations(userId: string, limit = 8): Promise<RecommendationFeed> {
  const profile = await buildUserProfile(userId);
  const insights = summariseProfile(profile);

  // Cold start — nothing to personalise on yet
  if (profile.signalCount === 0) {
    const { properties, hasActivity } = await getTrendingProperties(limit);
    return {
      isPersonalized: false,
      insights,
      items: properties.map((p) => ({
        property: p,
        score: 0,
        matchScore: null,
        reasons: [hasActivity && p.trending.score > 0 ? 'Trending in Ahmedabad this week' : 'New on The Plinth'],
      })),
    };
  }

  const excluded = [...profile.excludeIds].filter((id) => mongoose.isValidObjectId(id)).map(oid);
  const candidates = await listPublicProperties(
    excluded.length > 0 ? { _id: { $nin: excluded } } : {},
    { limit: CANDIDATE_LIMIT }
  );
  const ctx = await buildContext(userId, profile, candidates);
  const scored = candidates.map((c) => scoreCandidate(c, profile, ctx));
  scored.sort((a, b) => b.score - a.score);
  return { isPersonalized: true, insights, items: diversify(scored, limit) };
}

export interface PropertyExplanation {
  isPersonalized: boolean;
  matchScore: number | null;
  reasons: string[];
}

/** "Why this property?" — how well one listing fits the signed-in customer, and why. */
export async function explainProperty(userId: string, propertyId: string): Promise<PropertyExplanation> {
  const property = await getPublicProperty(propertyId);
  const profile = await buildUserProfile(userId, { excludePropertyId: String(property._id) });
  if (profile.signalCount === 0) return { isPersonalized: false, matchScore: null, reasons: [] };

  const ctx = await buildContext(userId, profile, [property]);
  const result = scoreCandidate(property, profile, ctx);
  return { isPersonalized: true, matchScore: result.matchScore, reasons: result.reasons };
}
