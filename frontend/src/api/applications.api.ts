import apiClient from './client';
import type {
  BuilderApplication,
  DSAApplication,
  ApplicationStatus,
  ApplicationCounts,
  BuilderApplicationFormData,
  DSAApplicationFormData,
  ReviewActionPayload,
  ApiResponse,
} from '../types';

// ─── Submission response ──────────────────────────────────────────────────────

export interface SubmitApplicationResult {
  applicationId: string;
  status: ApplicationStatus;
  email: string;
  submittedAt: string;
}

// ─── Public — submit applications (no auth required) ─────────────────────────

export async function submitBuilderApplicationApi(
  data: BuilderApplicationFormData
): Promise<SubmitApplicationResult> {
  const payload = {
    ...data,
    yearsOfExperience: Number(data.yearsOfExperience),
    numberOfProjects: Number(data.numberOfProjects),
  };
  const res = await apiClient.post<ApiResponse<SubmitApplicationResult>>(
    '/applications/builder',
    payload
  );
  return res.data.data!;
}

export async function submitDSAApplicationApi(
  data: DSAApplicationFormData
): Promise<SubmitApplicationResult> {
  // Convert comma-separated areas string to array
  const areasOfOperation = data.areasOfOperation
    ? data.areasOfOperation
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const payload = {
    ...data,
    yearsOfExperience: Number(data.yearsOfExperience),
    areasOfOperation,
  };
  const res = await apiClient.post<ApiResponse<SubmitApplicationResult>>(
    '/applications/dsa',
    payload
  );
  return res.data.data!;
}

// ─── Admin — read applications ────────────────────────────────────────────────

export async function getApplicationStatsApi(): Promise<ApplicationCounts> {
  const res = await apiClient.get<ApiResponse<ApplicationCounts>>(
    '/admin/applications/stats'
  );
  return res.data.data!;
}

export async function listBuilderApplicationsApi(
  status?: ApplicationStatus
): Promise<BuilderApplication[]> {
  const params = status ? { status } : {};
  const res = await apiClient.get<
    ApiResponse<{ applications: BuilderApplication[]; total: number }>
  >('/admin/applications/builders', { params });
  return res.data.data!.applications;
}

export async function listDSAApplicationsApi(
  status?: ApplicationStatus
): Promise<DSAApplication[]> {
  const params = status ? { status } : {};
  const res = await apiClient.get<
    ApiResponse<{ applications: DSAApplication[]; total: number }>
  >('/admin/applications/dsa', { params });
  return res.data.data!.applications;
}

export async function getBuilderApplicationApi(id: string): Promise<BuilderApplication> {
  const res = await apiClient.get<ApiResponse<{ application: BuilderApplication }>>(
    `/admin/applications/builders/${id}`
  );
  return res.data.data!.application;
}

export async function getDSAApplicationApi(id: string): Promise<DSAApplication> {
  const res = await apiClient.get<ApiResponse<{ application: DSAApplication }>>(
    `/admin/applications/dsa/${id}`
  );
  return res.data.data!.application;
}

// ─── Admin — review applications ──────────────────────────────────────────────

export interface ReviewResult {
  application: BuilderApplication | DSAApplication;
  temporaryPassword?: string;
  message: string;
}

export async function reviewBuilderApplicationApi(
  id: string,
  payload: ReviewActionPayload
): Promise<ReviewResult> {
  const res = await apiClient.patch<ApiResponse<ReviewResult>>(
    `/admin/applications/builders/${id}/review`,
    payload
  );
  return res.data.data!;
}

export async function reviewDSAApplicationApi(
  id: string,
  payload: ReviewActionPayload
): Promise<ReviewResult> {
  const res = await apiClient.patch<ApiResponse<ReviewResult>>(
    `/admin/applications/dsa/${id}/review`,
    payload
  );
  return res.data.data!;
}
