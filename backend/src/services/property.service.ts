import path from 'path';
import mongoose from 'mongoose';
import {
  Property,
  PropertyStatus,
  IProperty,
} from '../models/Property';
import {
  storageService,
  validatePropertyImageFile,
} from '../utils/storage';
import { User, UserRole, AccountStatus } from '../models/User';
import { escapeRegex, httpError } from '../utils/httpError';

// ─── Input types ──────────────────────────────────────────────────────────────

export interface BHKConfigInput {
  type: string;
  areaSqFt: number;
  priceMin: number;
  priceMax: number;
  totalUnits: number;
  availableUnits: number;
}

export interface PropertyImageInput {
  url: string;
  caption?: string;
  isPrimary?: boolean;
}

export interface PropertyDocumentInput {
  name: string;
  fileType: string;
  url: string;
  isPublic?: boolean;
}

export interface CreatePropertyInput {
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
  bhkConfigurations?: BHKConfigInput[];
  minPrice: number;
  maxPrice: number;
  minArea: number;
  maxArea: number;
  totalUnits: number;
  availableUnits: number;
  constructionStatus: string;
  possessionDate?: string;
  amenities?: string[];
  coverImageUrl?: string;
  images?: PropertyImageInput[];
  documents?: PropertyDocumentInput[];
}

export type UpdatePropertyInput = Partial<CreatePropertyInput>;

export interface DiscoveryQuery {
  search?: string;
  locality?: string;
  city?: string;
  propertyType?: string;
  bhk?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  constructionStatus?: string;
  page?: number;
  limit?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'area_asc';
}

// ─── Public-view helpers ──────────────────────────────────────────────────────
// Everything a customer can see goes through these so that admin-only data,
// non-public documents and the re-approval snapshot mechanics are handled once.

/** A property is publicly visible when APPROVED, or while an approved listing is re-under-review. */
export const PUBLIC_FILTER: Record<string, any> = {
  $or: [{ status: PropertyStatus.APPROVED }, { pendingReApproval: true }],
};

const PRIVATE_FIELDS = [
  'adminNotes',
  'rejectionReason',
  'reviewedBy',
  'reviewedAt',
  'submittedAt',
  'nearbyAmenitiesCache',
  'approvedSnapshot',
  'pendingReApproval',
  '__v',
];

export type PublicProperty = Record<string, any>;

/** Convert a stored property (doc or lean object) to what customers are allowed to see. */
export function toPublicView(raw: any): PublicProperty {
  const base: Record<string, any> = typeof raw?.toObject === 'function' ? raw.toObject() : { ...raw };

  // While an edit is awaiting re-approval, customers keep seeing the last approved version
  const merged =
    base.pendingReApproval && base.approvedSnapshot
      ? {
          ...base,
          ...base.approvedSnapshot,
          _id: base._id,
          builderId: base.builderId,
          documents: base.documents,
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        }
      : base;

  const view: Record<string, any> = { ...merged, status: PropertyStatus.APPROVED };
  view.documents = (view.documents || []).filter((d: { isPublic?: boolean }) => d.isPublic);
  for (const field of PRIVATE_FIELDS) delete view[field];
  return view;
}

/** Fetch publicly visible properties matching `extra`, already converted to public views. */
export async function listPublicProperties(
  extra: Record<string, any> = {},
  opts: { sort?: Record<string, 1 | -1>; skip?: number; limit?: number } = {}
): Promise<PublicProperty[]> {
  let query = Property.find({ $and: [PUBLIC_FILTER, extra] })
    .populate('builderId', 'name')
    .sort(opts.sort || { createdAt: -1 });
  if (opts.skip) query = query.skip(opts.skip);
  if (opts.limit) query = query.limit(opts.limit);
  const rows = await query.lean();
  return rows.map(toPublicView);
}

/** Public views for the given ids, in the order requested. Missing / non-public ids are dropped. */
export async function listPublicByIds(ids: string[]): Promise<PublicProperty[]> {
  const valid = [...new Set(ids)].filter((id) => mongoose.isValidObjectId(id));
  if (valid.length === 0) return [];
  const rows = await listPublicProperties({ _id: { $in: valid } });
  const byId = new Map(rows.map((p) => [String(p._id), p]));
  return valid.map((id) => byId.get(id)).filter((p): p is PublicProperty => Boolean(p));
}

/**
 * How well a candidate [min,max] range fits a target band. 1 = candidate sits inside the band,
 * 0.5 = partial overlap (at least one unit affordable), <0.5 = near miss, 0 = far away.
 */
export function rangeFit(candMin: number, candMax: number, bandMin: number, bandMax: number): number {
  const lo = Math.max(candMin, bandMin);
  const hi = Math.min(candMax, bandMax);
  if (hi >= lo) {
    const smallerSpan = Math.min(candMax - candMin, bandMax - bandMin);
    if (smallerSpan <= 0) return 1;
    return 0.5 + 0.5 * Math.min(1, (hi - lo) / smallerSpan);
  }
  const gap = lo - hi;
  const ref = Math.max((bandMin + bandMax) / 2, 1);
  return Math.max(0, 1 - gap / (0.6 * ref)) * 0.5;
}

/** Best price fit across a property's unit configurations (falls back to the project range). */
export function propertyBudgetFit(p: PublicProperty, band: { min: number; max: number }): number {
  const configs: Array<{ priceMin: number; priceMax: number }> = (p.bhkConfigurations || []).filter(
    (c: { priceMin: number; priceMax: number }) => c.priceMax > 0
  );
  if (configs.length === 0) return rangeFit(p.minPrice, p.maxPrice, band.min, band.max);
  return Math.max(...configs.map((c) => rangeFit(c.priceMin, c.priceMax, band.min, band.max)));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertValidId(id: string): void {
  if (!mongoose.isValidObjectId(id)) {
    const err: any = new Error('Invalid property ID');
    err.statusCode = 400;
    throw err;
  }
}

function assertOwnership(property: IProperty, builderId: string): void {
  // builderId may be a populated user object after .populate() — extract _id in that case
  const rawId = property.builderId as unknown;
  let storedId: string;
  if (rawId && typeof rawId === 'object' && '_id' in (rawId as object)) {
    storedId = (rawId as { _id: mongoose.Types.ObjectId })._id.toString();
  } else {
    storedId = (rawId as mongoose.Types.ObjectId).toString();
  }

  if (storedId !== builderId) {
    const err: any = new Error('You do not have permission to access this property');
    err.statusCode = 403;
    throw err;
  }
}

// ─── Builder CRUD ─────────────────────────────────────────────────────────────

export async function createProperty(
  builderId: string,
  input: CreatePropertyInput
): Promise<IProperty> {
  const data = {
    ...input,
    builderId: new mongoose.Types.ObjectId(builderId),
    status: PropertyStatus.DRAFT,
    possessionDate: input.possessionDate ? new Date(input.possessionDate) : undefined,
    coverImageUrl: input.coverImageUrl || undefined,
    images: (input.images || []).map((img, i) => ({
      ...img,
      isPrimary: img.isPrimary ?? i === 0,
      uploadedAt: new Date(),
    })),
    documents: (input.documents || []).map((doc) => ({
      ...doc,
      isPublic: doc.isPublic ?? false,
      uploadedAt: new Date(),
    })),
  };
  const property = await Property.create(data);
  return property;
}

export async function getBuilderProperties(
  builderId: string
): Promise<IProperty[]> {
  return Property.find({ builderId: new mongoose.Types.ObjectId(builderId) })
    .sort({ updatedAt: -1 })
    .lean();
}

export async function getPropertyById(id: string): Promise<IProperty> {
  assertValidId(id);
  const property = await Property.findById(id)
    .populate('builderId', 'name email phone')
    .populate('reviewedBy', 'name email');
  if (!property) {
    const err: any = new Error('Property not found');
    err.statusCode = 404;
    throw err;
  }
  return property;
}

export async function getBuilderPropertyById(
  id: string,
  builderId: string
): Promise<IProperty> {
  const property = await getPropertyById(id);
  assertOwnership(property, builderId);
  return property;
}

export async function updateProperty(
  id: string,
  builderId: string,
  input: UpdatePropertyInput
): Promise<IProperty> {
  const property = await getBuilderPropertyById(id, builderId);

  // Allowed edit states: DRAFT, CHANGES_REQUESTED, and APPROVED (triggers re-approval path)
  const editableStatuses = [
    PropertyStatus.DRAFT,
    PropertyStatus.CHANGES_REQUESTED,
    PropertyStatus.APPROVED,
  ];

  if (!editableStatuses.includes(property.status)) {
    const err: any = new Error(
      `Property cannot be edited when status is ${property.status}. You can edit DRAFT, CHANGES_REQUESTED, or APPROVED properties.`
    );
    err.statusCode = 409;
    throw err;
  }

  const updateData: Partial<IProperty> = { ...input } as any;
  if (input.possessionDate) {
    updateData.possessionDate = new Date(input.possessionDate);
  }
  if (input.images) {
    (updateData as any).images = input.images.map((img, i) => ({
      ...img,
      isPrimary: img.isPrimary ?? i === 0,
      uploadedAt: new Date(),
    }));
  }
  if (input.documents) {
    (updateData as any).documents = input.documents.map((doc) => ({
      ...doc,
      isPublic: doc.isPublic ?? false,
      uploadedAt: new Date(),
    }));
  }

  // When editing an APPROVED property, capture the current approved data as a snapshot
  // so customers continue to see the approved version while the edit is under review.
  if (property.status === PropertyStatus.APPROVED && !property.pendingReApproval) {
    (updateData as any).approvedSnapshot = {
      title: property.title,
      projectName: property.projectName,
      description: property.description,
      propertyType: property.propertyType,
      locality: property.locality,
      city: property.city,
      state: property.state,
      address: property.address,
      latitude: property.latitude,
      longitude: property.longitude,
      bhkConfigurations: property.bhkConfigurations,
      minPrice: property.minPrice,
      maxPrice: property.maxPrice,
      minArea: property.minArea,
      maxArea: property.maxArea,
      totalUnits: property.totalUnits,
      availableUnits: property.availableUnits,
      constructionStatus: property.constructionStatus,
      possessionDate: property.possessionDate,
      amenities: property.amenities,
      coverImageUrl: property.coverImageUrl,
      images: property.images,
    };
    // Move out of APPROVED into CHANGES_REQUESTED so edit form works normally
    (updateData as any).status = PropertyStatus.CHANGES_REQUESTED;
    (updateData as any).pendingReApproval = true;
  }

  const updated = await Property.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
  return updated!;
}

export async function uploadCoverImage(
  id: string,
  builderId: string,
  file: Express.Multer.File
): Promise<{ property: IProperty; coverImageUrl: string }> {
  const property = await getBuilderPropertyById(id, builderId);

  // Allowed edit states: DRAFT, CHANGES_REQUESTED, APPROVED
  const editableStatuses = [
    PropertyStatus.DRAFT,
    PropertyStatus.CHANGES_REQUESTED,
    PropertyStatus.APPROVED,
  ];

  if (!editableStatuses.includes(property.status)) {
    const err: any = new Error(
      `Property image cannot be updated when status is ${property.status}.`
    );
    err.statusCode = 409;
    throw err;
  }

  // Validate image type & size
  validatePropertyImageFile(file.mimetype, file.size);

  // Save via existing storageService in uploads/properties/<propertyId>/
  const stored = await storageService.save(
    {
      fieldname: file.fieldname,
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    },
    path.join('properties', id)
  );

  const coverImageUrl = stored.url;

  // If approved and not yet in re-approval snapshot mode, preserve snapshot first
  const updateData: Partial<IProperty> = {
    coverImageUrl,
  };

  // Sync with images array as primary image
  const existingImages = property.images ? [...property.images] : [];
  const primaryIdx = existingImages.findIndex((img) => img.isPrimary);
  if (primaryIdx >= 0) {
    existingImages[primaryIdx].url = coverImageUrl;
    existingImages[primaryIdx].uploadedAt = new Date();
  } else {
    existingImages.unshift({
      url: coverImageUrl,
      isPrimary: true,
      uploadedAt: new Date(),
    });
  }
  (updateData as any).images = existingImages;

  if (property.status === PropertyStatus.APPROVED && !property.pendingReApproval) {
    (updateData as any).approvedSnapshot = {
      title: property.title,
      projectName: property.projectName,
      description: property.description,
      propertyType: property.propertyType,
      locality: property.locality,
      city: property.city,
      state: property.state,
      address: property.address,
      latitude: property.latitude,
      longitude: property.longitude,
      bhkConfigurations: property.bhkConfigurations,
      minPrice: property.minPrice,
      maxPrice: property.maxPrice,
      minArea: property.minArea,
      maxArea: property.maxArea,
      totalUnits: property.totalUnits,
      availableUnits: property.availableUnits,
      constructionStatus: property.constructionStatus,
      possessionDate: property.possessionDate,
      amenities: property.amenities,
      coverImageUrl: property.coverImageUrl,
      images: property.images,
    };
    (updateData as any).status = PropertyStatus.CHANGES_REQUESTED;
    (updateData as any).pendingReApproval = true;
  }

  const updated = await Property.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  return { property: updated!, coverImageUrl };
}

export async function submitProperty(
  id: string,
  builderId: string
): Promise<IProperty> {
  const property = await getBuilderPropertyById(id, builderId);

  const submittableStatuses = [
    PropertyStatus.DRAFT,
    PropertyStatus.CHANGES_REQUESTED,
  ];

  if (!submittableStatuses.includes(property.status)) {
    const err: any = new Error(
      `Property cannot be submitted when status is ${property.status}.`
    );
    err.statusCode = 409;
    throw err;
  }

  // Minimal completeness check before submission
  if (!property.title || !property.projectName || !property.description) {
    const err: any = new Error('Property must have a title, project name, and description before submitting.');
    err.statusCode = 422;
    throw err;
  }

  // Mandatory Property Cover Image verification before submission
  const hasCoverImage = Boolean(
    property.coverImageUrl?.trim() ||
    property.images?.some((img) => img.url?.trim())
  );

  if (!hasCoverImage) {
    const err: any = new Error('Property cover image is required before submitting for admin approval.');
    err.statusCode = 422;
    throw err;
  }

  property.status = PropertyStatus.SUBMITTED;
  property.submittedAt = new Date();
  await property.save();
  return property;
}

export async function deleteProperty(
  id: string,
  builderId: string
): Promise<void> {
  const property = await getBuilderPropertyById(id, builderId);

  if (property.status !== PropertyStatus.DRAFT) {
    const err: any = new Error('Only DRAFT properties can be deleted.');
    err.statusCode = 409;
    throw err;
  }

  await Property.findByIdAndDelete(id);
}

// ─── Admin operations ─────────────────────────────────────────────────────────

export interface AdminPropertyQuery {
  status?: PropertyStatus;
  page?: number;
  limit?: number;
}

export async function adminListProperties(
  query: AdminPropertyQuery
): Promise<{ properties: IProperty[]; total: number; page: number; pages: number }> {
  const filter: Record<string, any> = {};
  if (query.status) filter.status = query.status;

  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .populate('builderId', 'name email phone')
      .populate('reviewedBy', 'name email')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Property.countDocuments(filter),
  ]);

  return { properties, total, page, pages: Math.ceil(total / limit) };
}

export async function adminGetProperty(id: string): Promise<IProperty> {
  // Admin can see any property regardless of status
  assertValidId(id);
  const property = await Property.findById(id)
    .populate('builderId', 'name email phone')
    .populate('reviewedBy', 'name email');
  if (!property) {
    const err: any = new Error('Property not found');
    err.statusCode = 404;
    throw err;
  }
  return property;
}

export async function adminReviewProperty(
  id: string,
  adminId: string,
  action: 'approve' | 'reject' | 'request_changes',
  adminNotes?: string,
  rejectionReason?: string
): Promise<IProperty> {
  assertValidId(id);
  const property = await Property.findById(id);
  if (!property) {
    const err: any = new Error('Property not found');
    err.statusCode = 404;
    throw err;
  }

  if (property.status !== PropertyStatus.SUBMITTED) {
    const err: any = new Error(
      `Cannot review a property with status ${property.status}. Only SUBMITTED properties can be reviewed.`
    );
    err.statusCode = 409;
    throw err;
  }

  switch (action) {
    case 'approve':
      property.status = PropertyStatus.APPROVED;
      // Clear re-approval tracking — new data is now live
      property.pendingReApproval = false;
      property.approvedSnapshot = undefined;
      break;
    case 'reject':
      property.status = PropertyStatus.REJECTED;
      property.rejectionReason = rejectionReason?.trim() || adminNotes?.trim();
      // If this was a re-approval, restore to previous approved state so customers still see it
      if (property.pendingReApproval && property.approvedSnapshot) {
        property.status = PropertyStatus.APPROVED;
        property.pendingReApproval = false;
        // We keep approvedSnapshot cleared since data has been restored to approved
        property.approvedSnapshot = undefined;
        // Store rejection on adminNotes only — the property reverts to approved for customers
        property.adminNotes = adminNotes?.trim();
        property.reviewedAt = new Date();
        property.reviewedBy = new mongoose.Types.ObjectId(adminId);
        await property.save();
        return property;
      }
      break;
    case 'request_changes':
      property.status = PropertyStatus.CHANGES_REQUESTED;
      // Keep approvedSnapshot so customers still see old approved data during edit phase
      break;
  }

  property.adminNotes = adminNotes?.trim();
  property.reviewedAt = new Date();
  property.reviewedBy = new mongoose.Types.ObjectId(adminId);
  await property.save();
  return property;
}

// ─── Public discovery ─────────────────────────────────────────────────────────

export async function discoverProperties(query: DiscoveryQuery): Promise<{
  properties: PublicProperty[];
  total: number;
  page: number;
  pages: number;
}> {
  // Show APPROVED properties, PLUS properties with pendingReApproval (they have an approvedSnapshot)
  const clauses: Record<string, any>[] = [PUBLIC_FILTER];
  const filter: Record<string, any> = { $and: clauses };

  // Free-text search. Every word must match at least one of: project, title, locality,
  // address, type, amenity, unit type, description or builder name. Partial words work
  // ("thalt" finds Thaltej) and user input is escaped so it can never break the query.
  const tokens = (query.search || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (tokens.length > 0) {
    const patterns = tokens.map((t) => new RegExp(escapeRegex(t), 'i'));
    const builders = await User.find({
      role: UserRole.BUILDER,
      accountStatus: AccountStatus.ACTIVE,
      $or: patterns.map((re) => ({ name: re })),
    })
      .select('name')
      .limit(100)
      .lean();

    for (const re of patterns) {
      const builderIds = builders.filter((b) => re.test(b.name)).map((b) => b._id);
      clauses.push({
        $or: [
          { projectName: re },
          { title: re },
          { locality: re },
          { address: re },
          { propertyType: re },
          { amenities: re },
          { 'bhkConfigurations.type': re },
          { description: re },
          ...(builderIds.length > 0 ? [{ builderId: { $in: builderIds } }] : []),
        ],
      });
    }
  }

  // Exact filters (anchored + escaped, case-insensitive)
  if (query.locality) filter.locality = new RegExp(`^${escapeRegex(query.locality.trim())}$`, 'i');
  if (query.city) filter.city = new RegExp(`^${escapeRegex(query.city.trim())}$`, 'i');
  if (query.propertyType) filter.propertyType = query.propertyType;
  if (query.constructionStatus) filter.constructionStatus = query.constructionStatus;

  // BHK filter
  if (query.bhk) {
    filter['bhkConfigurations.type'] = query.bhk;
  }

  // Price range
  if (query.minPrice !== undefined) filter.maxPrice = { $gte: query.minPrice };
  if (query.maxPrice !== undefined) filter.minPrice = { $lte: query.maxPrice };

  // Area range
  if (query.minArea !== undefined) filter.maxArea = { $gte: query.minArea };
  if (query.maxArea !== undefined) filter.minArea = { $lte: query.maxArea };

  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 12));
  const skip = (page - 1) * limit;

  // Sort
  let sort: Record<string, any> = { createdAt: -1 };
  if (query.sortBy === 'price_asc') sort = { minPrice: 1 };
  else if (query.sortBy === 'price_desc') sort = { maxPrice: -1 };
  else if (query.sortBy === 'area_asc') sort = { minArea: 1 };

  const [rawProperties, total] = await Promise.all([
    Property.find(filter)
      .populate('builderId', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Property.countDocuments(filter),
  ]);

  // Customers only ever see the public view (last approved snapshot, no admin-only data)
  const properties = rawProperties.map(toPublicView);

  return { properties, total, page, pages: Math.ceil(total / limit) };
}

export async function getPublicProperty(id: string): Promise<PublicProperty> {
  assertValidId(id);
  // Accept both APPROVED properties and pendingReApproval ones (serve their snapshot)
  const property = await Property.findOne({ _id: id, ...PUBLIC_FILTER })
    .populate('builderId', 'name')
    .lean();

  if (!property) {
    const err: any = new Error('Property not found');
    err.statusCode = 404;
    throw err;
  }

  return toPublicView(property);
}

// ─── Public discovery extras ──────────────────────────────────────────────────

export interface SearchSuggestions {
  projects: Array<{ id: string; name: string; locality: string }>;
  localities: Array<{ name: string; count: number }>;
  builders: Array<{ name: string; count: number }>;
}

/** Typeahead for the search box: matching projects, localities and builders. */
export async function suggestSearch(rawQuery: string): Promise<SearchSuggestions> {
  const q = rawQuery.trim().slice(0, 60);
  const empty: SearchSuggestions = { projects: [], localities: [], builders: [] };
  if (q.length < 2) return empty;
  const re = new RegExp(escapeRegex(q), 'i');

  const [projects, localities, builderUsers] = await Promise.all([
    Property.find({ $and: [PUBLIC_FILTER, { $or: [{ projectName: re }, { title: re }] }] })
      .select('projectName locality')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Property.aggregate([
      { $match: { $and: [PUBLIC_FILTER, { locality: re }] } },
      { $group: { _id: '$locality', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 5 },
    ]),
    User.find({ role: UserRole.BUILDER, accountStatus: AccountStatus.ACTIVE, name: re })
      .select('name')
      .limit(8)
      .lean(),
  ]);

  let builders: SearchSuggestions['builders'] = [];
  if (builderUsers.length > 0) {
    const counts: Array<{ _id: mongoose.Types.ObjectId; count: number }> = await Property.aggregate([
      { $match: { $and: [PUBLIC_FILTER, { builderId: { $in: builderUsers.map((b) => b._id) } }] } },
      { $group: { _id: '$builderId', count: { $sum: 1 } } },
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c.count]));
    builders = builderUsers
      .filter((b) => countById.has(String(b._id)))
      .map((b) => ({ name: b.name, count: countById.get(String(b._id)) || 0 }))
      .slice(0, 4);
  }

  return {
    projects: projects.map((p) => ({ id: String(p._id), name: p.projectName, locality: p.locality })),
    localities: localities.map((l: { _id: string; count: number }) => ({ name: l._id, count: l.count })),
    builders,
  };
}

export interface LocalityStat {
  locality: string;
  count: number;
  minPrice: number;
  maxPrice: number;
  avgPricePerSqFt: number;
  coverImageUrl?: string;
}

/** Live per-locality inventory used by the "Explore localities" section. */
export async function getLocalityStats(): Promise<LocalityStat[]> {
  const rows: Array<{
    _id: string;
    count: number;
    minPrice: number;
    maxPrice: number;
    avgPricePerSqFt: number;
    coverImageUrl?: string;
  }> = await Property.aggregate([
    { $match: PUBLIC_FILTER },
    { $sort: { createdAt: -1 } },
    {
      $addFields: {
        psf: {
          $let: {
            vars: {
              price: { $avg: ['$minPrice', '$maxPrice'] },
              area: { $avg: ['$minArea', '$maxArea'] },
            },
            in: { $cond: [{ $gt: ['$$area', 0] }, { $divide: ['$$price', '$$area'] }, null] },
          },
        },
      },
    },
    {
      $group: {
        _id: '$locality',
        count: { $sum: 1 },
        minPrice: { $min: '$minPrice' },
        maxPrice: { $max: '$maxPrice' },
        avgPricePerSqFt: { $avg: '$psf' },
        coverImageUrl: { $first: '$coverImageUrl' },
      },
    },
    { $sort: { count: -1, _id: 1 } },
  ]);

  return rows.map((r) => ({
    locality: r._id,
    count: r.count,
    minPrice: r.minPrice,
    maxPrice: r.maxPrice,
    avgPricePerSqFt: Math.round(r.avgPricePerSqFt || 0),
    coverImageUrl: r.coverImageUrl,
  }));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const A = new Set(a.map((s) => s.toLowerCase()));
  const B = new Set(b.map((s) => s.toLowerCase()));
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter += 1; });
  return inter / (A.size + B.size - inter);
}

/** Content-based "similar properties" — locality, type, price overlap, unit mix, amenities. */
export async function getSimilarProperties(id: string, limit = 6): Promise<PublicProperty[]> {
  const base = await getPublicProperty(id);
  const candidates = await listPublicProperties({ _id: { $ne: base._id } }, { limit: 300 });
  const baseBhk: string[] = (base.bhkConfigurations || []).map((c: { type: string }) => c.type);
  const baseBand = { min: base.minPrice * 0.85, max: base.maxPrice * 1.15 };

  return candidates
    .map((c) => {
      const score =
        0.30 * (c.locality === base.locality ? 1 : 0) +
        0.15 * (c.propertyType === base.propertyType ? 1 : 0) +
        0.25 * propertyBudgetFit(c, baseBand) +
        0.15 * jaccard(baseBhk, (c.bhkConfigurations || []).map((x: { type: string }) => x.type)) +
        0.05 * (c.constructionStatus === base.constructionStatus ? 1 : 0) +
        0.10 * jaccard(base.amenities || [], c.amenities || []);
      return { ...c, similarity: Math.round(score * 100) };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Side-by-side comparison — up to 4 public properties, in the order requested. */
export async function getPropertiesForCompare(ids: string[]): Promise<PublicProperty[]> {
  if (ids.length < 2) throw httpError(400, 'Select at least two properties to compare');
  return listPublicByIds(ids.slice(0, 4));
}

// ─── Admin property counts (for dashboard stats) ──────────────────────────────

export async function getPropertyCounts(): Promise<{
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  total: number;
}> {
  const [draft, submitted, approved, rejected, changesRequested, total] =
    await Promise.all([
      Property.countDocuments({ status: PropertyStatus.DRAFT }),
      Property.countDocuments({ status: PropertyStatus.SUBMITTED }),
      Property.countDocuments({ status: PropertyStatus.APPROVED }),
      Property.countDocuments({ status: PropertyStatus.REJECTED }),
      Property.countDocuments({ status: PropertyStatus.CHANGES_REQUESTED }),
      Property.countDocuments(),
    ]);
  return { draft, submitted, approved, rejected, changesRequested, total };
}
