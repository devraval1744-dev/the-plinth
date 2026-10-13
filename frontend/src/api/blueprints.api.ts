import apiClient from './client';
import type { Blueprint, ApiResponse } from '../types';

// ─── Builder ──────────────────────────────────────────────────────────────────

export async function getPropertyBlueprintsApi(propertyId: string): Promise<Blueprint[]> {
  const res = await apiClient.get<ApiResponse<{ blueprints: Blueprint[] }>>(
    `/properties/${propertyId}/blueprints`
  );
  return res.data.data!.blueprints;
}

export async function getBlueprintByIdApi(propertyId: string, blueprintId: string): Promise<Blueprint> {
  const res = await apiClient.get<ApiResponse<{ blueprint: Blueprint }>>(
    `/properties/${propertyId}/blueprints/${blueprintId}`
  );
  return res.data.data!.blueprint;
}

export async function uploadBlueprintApi(
  propertyId: string,
  formData: FormData
): Promise<Blueprint> {
  const res = await apiClient.post<ApiResponse<{ blueprint: Blueprint }>>(
    `/properties/${propertyId}/blueprints`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return res.data.data!.blueprint;
}

export async function replaceBlueprintApi(
  propertyId: string,
  blueprintId: string,
  formData: FormData
): Promise<Blueprint> {
  const res = await apiClient.post<ApiResponse<{ blueprint: Blueprint }>>(
    `/properties/${propertyId}/blueprints/${blueprintId}/replace`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return res.data.data!.blueprint;
}

export async function updateBlueprintMetadataApi(
  propertyId: string,
  blueprintId: string,
  data: { title?: string; description?: string; blueprintType?: string }
): Promise<Blueprint> {
  const res = await apiClient.patch<ApiResponse<{ blueprint: Blueprint }>>(
    `/properties/${propertyId}/blueprints/${blueprintId}`,
    data
  );
  return res.data.data!.blueprint;
}

export async function archiveBlueprintApi(
  propertyId: string,
  blueprintId: string
): Promise<Blueprint> {
  const res = await apiClient.post<ApiResponse<{ blueprint: Blueprint }>>(
    `/properties/${propertyId}/blueprints/${blueprintId}/archive`
  );
  return res.data.data!.blueprint;
}

// ─── Public ───────────────────────────────────────────────────────────────────

export async function getPublicBlueprintsApi(propertyId: string): Promise<Blueprint[]> {
  const res = await apiClient.get<ApiResponse<{ blueprints: Blueprint[] }>>(
    `/properties/${propertyId}/blueprints/public`
  );
  return res.data.data!.blueprints;
}

export async function getPublicBlueprintByIdApi(
  propertyId: string,
  blueprintId: string
): Promise<Blueprint> {
  const res = await apiClient.get<ApiResponse<{ blueprint: Blueprint }>>(
    `/properties/${propertyId}/blueprints/public/${blueprintId}`
  );
  return res.data.data!.blueprint;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function getAdminPropertyBlueprintsApi(propertyId: string): Promise<Blueprint[]> {
  const res = await apiClient.get<ApiResponse<{ blueprints: Blueprint[] }>>(
    `/admin/properties/${propertyId}/blueprints`
  );
  return res.data.data!.blueprints;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

import type { BlueprintAnalysisJob, Public3DResult } from '../types';

export async function triggerAnalysisApi(
  propertyId: string,
  blueprintId: string,
): Promise<{ status: string; jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ status: string; jobId: string }>>(
    `/properties/${propertyId}/blueprints/${blueprintId}/analyze`
  );
  return res.data.data!;
}

export async function getAnalysisApi(
  propertyId: string,
  blueprintId: string,
): Promise<BlueprintAnalysisJob | null> {
  const res = await apiClient.get<ApiResponse<{ analysis: BlueprintAnalysisJob | null }>>(
    `/properties/${propertyId}/blueprints/${blueprintId}/analysis`
  );
  return res.data.data!.analysis;
}

export async function getAnalysisStatusApi(
  propertyId: string,
  blueprintId: string,
): Promise<{ status: string; isDemo: boolean; provider: string } | null> {
  const res = await apiClient.get<ApiResponse<{ status: string; isDemo: boolean; provider: string } | null>>(
    `/properties/${propertyId}/blueprints/${blueprintId}/analysis/status`
  );
  return res.data.data ?? null;
}

export async function retryAnalysisApi(
  propertyId: string,
  blueprintId: string,
): Promise<{ status: string; jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ status: string; jobId: string }>>(
    `/properties/${propertyId}/blueprints/${blueprintId}/analysis/retry`
  );
  return res.data.data!;
}

export async function getPublic3DApi(
  propertyId: string,
  blueprintId: string,
): Promise<Public3DResult> {
  const res = await apiClient.get<ApiResponse<Public3DResult>>(
    `/properties/${propertyId}/blueprints/${blueprintId}/3d`
  );
  return res.data.data!;
}

export async function adminGetAnalysisApi(
  propertyId: string,
  blueprintId: string,
): Promise<BlueprintAnalysisJob | null> {
  const res = await apiClient.get<ApiResponse<{ analysis: BlueprintAnalysisJob | null }>>(
    `/admin/properties/${propertyId}/blueprints/${blueprintId}/analysis`
  );
  return res.data.data!.analysis;
}
