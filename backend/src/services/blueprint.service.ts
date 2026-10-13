import mongoose from 'mongoose';
import { Blueprint, BlueprintLevel, BlueprintStatus, IBlueprint } from '../models/Blueprint';
import { Property, PropertyStatus } from '../models/Property';
import { storageService, validateBlueprintFile, UploadedFile } from '../utils/storage';

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateBlueprintInput {
  level: BlueprintLevel;
  blueprintType: string;
  unitType?: string;
  unitLabel?: string;
  title: string;
  description?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertValidId(id: string, label = 'ID'): void {
  if (!mongoose.isValidObjectId(id)) {
    const err: any = new Error(`Invalid ${label}`);
    err.statusCode = 400;
    throw err;
  }
}

async function assertPropertyOwnership(
  propertyId: string,
  builderId: string
): Promise<void> {
  const property = await Property.findById(propertyId);
  if (!property) {
    const err: any = new Error('Property not found');
    err.statusCode = 404;
    throw err;
  }
  if (property.builderId.toString() !== builderId) {
    const err: any = new Error('You do not have permission to manage blueprints for this property');
    err.statusCode = 403;
    throw err;
  }
}

async function assertApprovedProperty(propertyId: string): Promise<void> {
  const property = await Property.findById(propertyId);
  if (!property) {
    const err: any = new Error('Property not found');
    err.statusCode = 404;
    throw err;
  }
  // Allow access for APPROVED properties and properties with pending re-approval
  // (they have an approvedSnapshot which is what customers see)
  const isVisible =
    property.status === PropertyStatus.APPROVED ||
    (property as any).pendingReApproval === true;
  if (!isVisible) {
    const err: any = new Error('Blueprints are not available for this property');
    err.statusCode = 404;
    throw err;
  }
}

// ─── Get next version number for a given slot ─────────────────────────────────

async function getNextVersion(
  propertyId: string,
  level: BlueprintLevel,
  unitType?: string,
  unitLabel?: string
): Promise<number> {
  // Build a filter that matches the exact slot
  const filter: Record<string, any> = {
    propertyId: new mongoose.Types.ObjectId(propertyId),
    level,
    // For PROPERTY level: unitType absent; for UNIT level: must match
    unitType:  unitType  ? unitType  : { $in: [null, undefined, ''] },
    unitLabel: unitLabel ? unitLabel : { $in: [null, undefined, ''] },
  };

  const latest = await Blueprint.findOne(filter)
    .sort({ version: -1 })
    .select('version')
    .lean();

  return latest ? latest.version + 1 : 1;
}

// ─── Upload / create blueprint ────────────────────────────────────────────────

export async function createBlueprint(
  propertyId: string,
  builderId: string,
  input: CreateBlueprintInput,
  file: UploadedFile
): Promise<IBlueprint> {
  assertValidId(propertyId, 'property ID');
  await assertPropertyOwnership(propertyId, builderId);

  // Validate the uploaded file
  validateBlueprintFile(file.mimetype, file.size);

  // UNIT blueprints require unitType
  if (input.level === BlueprintLevel.UNIT && !input.unitType?.trim()) {
    const err: any = new Error('Unit type is required for UNIT level blueprints');
    err.statusCode = 422;
    throw err;
  }

  // Check that the unit type exists on the property (for UNIT blueprints)
  if (input.level === BlueprintLevel.UNIT && input.unitType) {
    const property = await Property.findById(propertyId).lean();
    const configExists = property?.bhkConfigurations?.some(
      (c) => c.type === input.unitType
    );
    if (!configExists) {
      const err: any = new Error(
        `Unit type "${input.unitType}" does not exist in this property's BHK configurations`
      );
      err.statusCode = 422;
      throw err;
    }
  }

  // Archive any existing ACTIVE blueprint for this exact slot
  await Blueprint.updateMany(
    {
      propertyId: new mongoose.Types.ObjectId(propertyId),
      level: input.level,
      unitType:  input.unitType
        ? input.unitType
        : { $in: [null, undefined, ''] },
      unitLabel: input.unitLabel
        ? input.unitLabel
        : { $in: [null, undefined, ''] },
      status: BlueprintStatus.ACTIVE,
    },
    { $set: { status: BlueprintStatus.ARCHIVED } }
  );

  // Determine version
  const version = await getNextVersion(
    propertyId,
    input.level,
    input.unitType,
    input.unitLabel
  );

  // Save file to storage
  const stored = await storageService.save(
    file,
    `blueprints/${propertyId}`
  );

  // Create blueprint record
  const blueprint = await Blueprint.create({
    propertyId:    new mongoose.Types.ObjectId(propertyId),
    builderId:     new mongoose.Types.ObjectId(builderId),
    level:         input.level,
    blueprintType: input.blueprintType,
    unitType:      input.unitType  || undefined,
    unitLabel:     input.unitLabel || undefined,
    title:         input.title.trim(),
    description:   input.description?.trim(),
    fileUrl:       stored.url,
    fileName:      stored.fileName,
    fileMimeType:  stored.fileMimeType,
    fileSizeBytes: stored.fileSizeBytes,
    version,
    status:  BlueprintStatus.ACTIVE,
    uploadedBy: new mongoose.Types.ObjectId(builderId),
  });

  return blueprint;
}

// ─── Replace blueprint (new version) ─────────────────────────────────────────

export async function replaceBlueprint(
  propertyId: string,
  blueprintId: string,
  builderId: string,
  input: Partial<CreateBlueprintInput>,
  file: UploadedFile
): Promise<IBlueprint> {
  assertValidId(propertyId, 'property ID');
  assertValidId(blueprintId, 'blueprint ID');
  await assertPropertyOwnership(propertyId, builderId);

  const existing = await Blueprint.findOne({
    _id: blueprintId,
    propertyId: new mongoose.Types.ObjectId(propertyId),
    builderId: new mongoose.Types.ObjectId(builderId),
  });
  if (!existing) {
    const err: any = new Error('Blueprint not found');
    err.statusCode = 404;
    throw err;
  }

  validateBlueprintFile(file.mimetype, file.size);

  // Archive the existing active record
  existing.status = BlueprintStatus.ARCHIVED;
  await existing.save();

  // Store the new file
  const stored = await storageService.save(file, `blueprints/${propertyId}`);

  // Create new version with same slot identifiers
  const version = existing.version + 1;
  const blueprint = await Blueprint.create({
    propertyId:    existing.propertyId,
    builderId:     existing.builderId,
    level:         existing.level,
    blueprintType: input.blueprintType || existing.blueprintType,
    unitType:      existing.unitType,
    unitLabel:     existing.unitLabel,
    title:         (input.title || existing.title).trim(),
    description:   (input.description ?? existing.description)?.trim(),
    fileUrl:       stored.url,
    fileName:      stored.fileName,
    fileMimeType:  stored.fileMimeType,
    fileSizeBytes: stored.fileSizeBytes,
    version,
    status:  BlueprintStatus.ACTIVE,
    uploadedBy: new mongoose.Types.ObjectId(builderId),
  });

  return blueprint;
}

// ─── Get blueprints for a property (builder view) ─────────────────────────────

export async function getPropertyBlueprintsForBuilder(
  propertyId: string,
  builderId: string
): Promise<IBlueprint[]> {
  assertValidId(propertyId, 'property ID');
  await assertPropertyOwnership(propertyId, builderId);

  return Blueprint.find({
    propertyId: new mongoose.Types.ObjectId(propertyId),
    builderId:  new mongoose.Types.ObjectId(builderId),
  })
    .sort({ level: 1, unitType: 1, unitLabel: 1, version: -1 })
    .lean();
}

// ─── Get single blueprint (builder) ──────────────────────────────────────────

export async function getBlueprintForBuilder(
  propertyId: string,
  blueprintId: string,
  builderId: string
): Promise<IBlueprint> {
  assertValidId(propertyId, 'property ID');
  assertValidId(blueprintId, 'blueprint ID');
  await assertPropertyOwnership(propertyId, builderId);

  const bp = await Blueprint.findOne({
    _id: blueprintId,
    propertyId: new mongoose.Types.ObjectId(propertyId),
  });
  if (!bp) {
    const err: any = new Error('Blueprint not found');
    err.statusCode = 404;
    throw err;
  }
  return bp;
}

// ─── Update blueprint metadata (no file change) ───────────────────────────────

export async function updateBlueprintMetadata(
  propertyId: string,
  blueprintId: string,
  builderId: string,
  input: { title?: string; description?: string; blueprintType?: string }
): Promise<IBlueprint> {
  assertValidId(propertyId, 'property ID');
  assertValidId(blueprintId, 'blueprint ID');
  await assertPropertyOwnership(propertyId, builderId);

  const bp = await Blueprint.findOneAndUpdate(
    {
      _id: blueprintId,
      propertyId: new mongoose.Types.ObjectId(propertyId),
      builderId:  new mongoose.Types.ObjectId(builderId),
      status: BlueprintStatus.ACTIVE,
    },
    {
      $set: {
        ...(input.title        ? { title: input.title.trim() }             : {}),
        ...(input.description  !== undefined ? { description: input.description?.trim() } : {}),
        ...(input.blueprintType ? { blueprintType: input.blueprintType }   : {}),
      },
    },
    { new: true }
  );
  if (!bp) {
    const err: any = new Error('Blueprint not found or already archived');
    err.statusCode = 404;
    throw err;
  }
  return bp;
}

// ─── Archive blueprint ────────────────────────────────────────────────────────

export async function archiveBlueprint(
  propertyId: string,
  blueprintId: string,
  builderId: string
): Promise<IBlueprint> {
  assertValidId(propertyId, 'property ID');
  assertValidId(blueprintId, 'blueprint ID');
  await assertPropertyOwnership(propertyId, builderId);

  const bp = await Blueprint.findOneAndUpdate(
    {
      _id: blueprintId,
      propertyId: new mongoose.Types.ObjectId(propertyId),
      builderId:  new mongoose.Types.ObjectId(builderId),
    },
    { $set: { status: BlueprintStatus.ARCHIVED } },
    { new: true }
  );
  if (!bp) {
    const err: any = new Error('Blueprint not found');
    err.statusCode = 404;
    throw err;
  }
  return bp;
}

// ─── Public discovery (APPROVED properties only) ──────────────────────────────

export async function getPublicBlueprints(
  propertyId: string
): Promise<IBlueprint[]> {
  assertValidId(propertyId, 'property ID');
  await assertApprovedProperty(propertyId);

  return Blueprint.find({
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: BlueprintStatus.ACTIVE,
  })
    .sort({ level: 1, unitType: 1, unitLabel: 1 })
    .lean();
}

export async function getPublicBlueprint(
  propertyId: string,
  blueprintId: string
): Promise<IBlueprint> {
  assertValidId(propertyId, 'property ID');
  assertValidId(blueprintId, 'blueprint ID');
  await assertApprovedProperty(propertyId);

  const bp = await Blueprint.findOne({
    _id: blueprintId,
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: BlueprintStatus.ACTIVE,
  });
  if (!bp) {
    const err: any = new Error('Blueprint not found');
    err.statusCode = 404;
    throw err;
  }
  return bp;
}

// ─── Admin: get all blueprints for any property ───────────────────────────────

export async function getAdminPropertyBlueprints(
  propertyId: string
): Promise<IBlueprint[]> {
  assertValidId(propertyId, 'property ID');

  return Blueprint.find({ propertyId: new mongoose.Types.ObjectId(propertyId) })
    .sort({ level: 1, unitType: 1, unitLabel: 1, version: -1 })
    .lean();
}
