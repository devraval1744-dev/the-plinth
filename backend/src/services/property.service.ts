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
  properties: IProperty[];
  total: number;
  page: number;
  pages: number;
}> {
  const filter: Record<string, any> = {
    // Show APPROVED properties, PLUS properties with pendingReApproval (they have an approvedSnapshot)
    $or: [
      { status: PropertyStatus.APPROVED },
      { pendingReApproval: true },
    ],
  };

  // Text search
  if (query.search?.trim()) {
    filter.$text = { $search: query.search.trim() };
  }

  // Exact filters
  if (query.locality) filter.locality = { $regex: new RegExp(query.locality, 'i') };
  if (query.city) filter.city = { $regex: new RegExp(query.city, 'i') };
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
      .populate('builderId', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Property.countDocuments(filter),
  ]);

  // For pendingReApproval properties, serve the approvedSnapshot as the public-facing data
  const properties = rawProperties.map((p: any) => {
    if (p.pendingReApproval && p.approvedSnapshot) {
      return {
        ...p,
        ...p.approvedSnapshot,
        _id: p._id,
        builderId: p.builderId,
        status: PropertyStatus.APPROVED, // Present as APPROVED to customers
        pendingReApproval: undefined,
        approvedSnapshot: undefined,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    }
    return p;
  });

  return { properties: properties as IProperty[], total, page, pages: Math.ceil(total / limit) };
}

export async function getPublicProperty(id: string): Promise<IProperty> {
  assertValidId(id);
  // Accept both APPROVED properties and pendingReApproval ones (serve their snapshot)
  const property = await Property.findOne({
    _id: id,
    $or: [
      { status: PropertyStatus.APPROVED },
      { pendingReApproval: true },
    ],
  }).populate('builderId', 'name email');

  if (!property) {
    const err: any = new Error('Property not found');
    err.statusCode = 404;
    throw err;
  }

  // Serve the last-approved snapshot if the current version is under re-review
  if (property.pendingReApproval && property.approvedSnapshot) {
    const snap = property.approvedSnapshot as any;
    // Merge snapshot fields over the document, preserve identity fields
    return {
      ...property.toObject(),
      ...snap,
      _id: property._id,
      builderId: property.builderId,
      status: PropertyStatus.APPROVED,
      pendingReApproval: false,
      approvedSnapshot: undefined,
    } as unknown as IProperty;
  }

  return property;
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
