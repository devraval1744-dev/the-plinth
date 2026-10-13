import mongoose from 'mongoose';
import {
  BlueprintAnalysis,
  AnalysisStatus,
  IBlueprintAnalysis,
  SpatialAnalysis,
} from '../models/BlueprintAnalysis';
import { Blueprint, BlueprintStatus } from '../models/Blueprint';
import { Property, PropertyStatus } from '../models/Property';
import { callAnalyzeEndpoint } from './ai.client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertValidId(id: string, label = 'ID'): void {
  if (!mongoose.isValidObjectId(id)) {
    const err: any = new Error(`Invalid ${label}`);
    err.statusCode = 400;
    throw err;
  }
}

async function getOwnedActiveBlueprint(
  blueprintId: string,
  propertyId: string,
  builderId: string,
) {
  assertValidId(blueprintId, 'blueprint ID');
  assertValidId(propertyId, 'property ID');

  const bp = await Blueprint.findOne({
    _id: blueprintId,
    propertyId: new mongoose.Types.ObjectId(propertyId),
    builderId:  new mongoose.Types.ObjectId(builderId),
    status: BlueprintStatus.ACTIVE,
  });

  if (!bp) {
    const err: any = new Error(
      'Blueprint not found, is not active, or does not belong to your property'
    );
    err.statusCode = 404;
    throw err;
  }
  return bp;
}

// ─── Trigger analysis ─────────────────────────────────────────────────────────

export async function triggerAnalysis(
  blueprintId: string,
  propertyId: string,
  builderId: string,
): Promise<IBlueprintAnalysis> {
  const bp = await getOwnedActiveBlueprint(blueprintId, propertyId, builderId);

  // Upsert: one record per (blueprintId + version).
  // If a previous analysis for this version exists, reset it and re-run.
  let job = await BlueprintAnalysis.findOne({
    blueprintId: bp._id,
    blueprintVersion: bp.version,
  });

  if (job) {
    if (job.status === AnalysisStatus.PROCESSING || job.status === AnalysisStatus.QUEUED) {
      const err: any = new Error('Analysis is already in progress for this blueprint version');
      err.statusCode = 409;
      throw err;
    }
    // Reset for re-run / retry
    job.status      = AnalysisStatus.QUEUED;
    job.analysis    = undefined;
    job.errorMessage = undefined;
    job.startedAt   = undefined;
    job.completedAt = undefined;
    await job.save();
  } else {
    job = await BlueprintAnalysis.create({
      blueprintId:      bp._id,
      propertyId:       bp.propertyId,
      builderId:        bp.builderId,
      unitType:         bp.unitType,
      blueprintVersion: bp.version,
      provider:         'demo',
      isDemo:           true,
      status:           AnalysisStatus.QUEUED,
    });
  }

  // Run synchronously for MVP (no background queue needed at this scale)
  _runAnalysis(job._id.toString(), bp.fileUrl, bp.unitType);

  return job;
}

async function _runAnalysis(
  jobId: string,
  fileUrl: string,
  unitType?: string,
): Promise<void> {
  let job: IBlueprintAnalysis | null = null;
  try {
    job = await BlueprintAnalysis.findById(jobId);
    if (!job) return;

    job.status    = AnalysisStatus.PROCESSING;
    job.startedAt = new Date();
    await job.save();

    const result: SpatialAnalysis = await callAnalyzeEndpoint(
      fileUrl,
      job.blueprintId.toString(),
      job.blueprintVersion,
      unitType,
    );

    job.status      = AnalysisStatus.COMPLETED;
    job.analysis    = result;
    job.isDemo      = result.is_demo;
    job.provider    = result.provider;
    job.completedAt = new Date();
    await job.save();
  } catch (err: any) {
    if (job) {
      job.status       = AnalysisStatus.FAILED;
      job.errorMessage = err.message ?? 'Unknown error';
      await job.save();
    }
  }
}

// ─── Get analysis ─────────────────────────────────────────────────────────────

export async function getAnalysis(
  blueprintId: string,
  propertyId: string,
  builderId: string,
): Promise<IBlueprintAnalysis | null> {
  const bp = await getOwnedActiveBlueprint(blueprintId, propertyId, builderId);
  return BlueprintAnalysis.findOne({
    blueprintId: bp._id,
    blueprintVersion: bp.version,
  }).lean();
}

export async function getAnalysisStatus(
  blueprintId: string,
  propertyId: string,
  builderId: string,
): Promise<{ status: AnalysisStatus; isDemo: boolean; provider: string } | null> {
  const bp = await getOwnedActiveBlueprint(blueprintId, propertyId, builderId);
  const job = await BlueprintAnalysis.findOne({
    blueprintId: bp._id,
    blueprintVersion: bp.version,
  }).select('status isDemo provider').lean();
  if (!job) return null;
  return { status: job.status, isDemo: job.isDemo, provider: job.provider };
}

// ─── Public 3D endpoint (APPROVED property only) ──────────────────────────────

export async function getPublic3D(
  blueprintId: string,
  propertyId: string,
): Promise<{ analysis: SpatialAnalysis; isDemo: boolean; provider: string }> {
  assertValidId(blueprintId, 'blueprint ID');
  assertValidId(propertyId, 'property ID');

  // Verify property is APPROVED (or pendingReApproval with snapshot)
  const property = await Property.findById(propertyId);
  if (!property) {
    const err: any = new Error('Property not found');
    err.statusCode = 404;
    throw err;
  }
  const isVisible =
    property.status === PropertyStatus.APPROVED ||
    (property as any).pendingReApproval === true;
  if (!isVisible) {
    const err: any = new Error('3D visualization not available for this property');
    err.statusCode = 404;
    throw err;
  }

  // The blueprint must be ACTIVE (not archived)
  const bp = await Blueprint.findOne({
    _id: blueprintId,
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: BlueprintStatus.ACTIVE,
  });
  if (!bp) {
    const err: any = new Error('Blueprint not found or not active');
    err.statusCode = 404;
    throw err;
  }

  // Retrieve analysis only for the current ACTIVE version
  const job = await BlueprintAnalysis.findOne({
    blueprintId: bp._id,
    blueprintVersion: bp.version,
    status: AnalysisStatus.COMPLETED,
  });
  if (!job || !job.analysis) {
    const err: any = new Error(
      job
        ? `3D visualization is ${job.status.toLowerCase().replace('_', ' ')}`
        : '3D visualization not yet available'
    );
    err.statusCode = 404;
    throw err;
  }

  return {
    analysis: job.analysis,
    isDemo:   job.isDemo,
    provider: job.provider,
  };
}

// ─── Admin get analysis ───────────────────────────────────────────────────────

export async function adminGetAnalysis(
  blueprintId: string,
  propertyId: string,
): Promise<IBlueprintAnalysis | null> {
  assertValidId(blueprintId);
  assertValidId(propertyId);
  return BlueprintAnalysis.findOne({
    blueprintId: new mongoose.Types.ObjectId(blueprintId),
    propertyId:  new mongoose.Types.ObjectId(propertyId),
  }).sort({ blueprintVersion: -1 }).lean();
}
