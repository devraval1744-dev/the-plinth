import apiClient from './client';
import type {
  Property,
  PropertyCounts,
  PropertyDiscoveryQuery,
  PaginatedProperties,
  PropertyReviewPayload,
  ApiResponse,
} from '../types';

// ─── Builder ──────────────────────────────────────────────────────────────────

export async function createPropertyApi(data: Record<string, unknown>): Promise<Property> {
  const res = await apiClient.post<ApiResponse<{ property: Property }>>('/properties', data);
  return res.data.data!.property;
}

export async function getMyPropertiesApi(): Promise<Property[]> {
  const res = await apiClient.get<ApiResponse<{ properties: Property[] }>>('/properties/mine');
  return res.data.data!.properties;
}

export async function getMyPropertyByIdApi(id: string): Promise<Property> {
  const res = await apiClient.get<ApiResponse<{ property: Property }>>(`/properties/${id}?view=builder`);
  return res.data.data!.property;
}

export async function updatePropertyApi(id: string, data: Record<string, unknown>): Promise<Property> {
  const res = await apiClient.patch<ApiResponse<{ property: Property }>>(`/properties/${id}`, data);
  return res.data.data!.property;
}

export async function uploadCoverImageApi(id: string, file: File): Promise<{ property: Property; coverImageUrl: string }> {
  const formData = new FormData();
  formData.append('coverImage', file);
  const res = await apiClient.post<ApiResponse<{ property: Property; coverImageUrl: string }>>(
    `/properties/${id}/cover-image`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return res.data.data!;
}

export async function submitPropertyApi(id: string): Promise<Property> {
  const res = await apiClient.post<ApiResponse<{ property: Property }>>(`/properties/${id}/submit`);
  return res.data.data!.property;
}

export async function deletePropertyApi(id: string): Promise<void> {
  await apiClient.delete(`/properties/${id}`);
}

// ─── Public discovery ─────────────────────────────────────────────────────────

export async function discoverPropertiesApi(
  query: PropertyDiscoveryQuery = {}
): Promise<PaginatedProperties> {
  const params = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== null)
  );
  const res = await apiClient.get<ApiResponse<PaginatedProperties>>('/properties', { params });
  return res.data.data!;
}

export async function getPublicPropertyApi(id: string): Promise<Property> {
  const res = await apiClient.get<ApiResponse<{ property: Property }>>(`/properties/${id}`);
  return res.data.data!.property;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function adminGetPropertyStatsApi(): Promise<PropertyCounts> {
  const res = await apiClient.get<ApiResponse<PropertyCounts>>('/admin/properties/stats');
  return res.data.data!;
}

export async function adminListPropertiesApi(
  status?: string,
  page = 1
): Promise<PaginatedProperties> {
  const params: Record<string, unknown> = { page };
  if (status) params.status = status;
  const res = await apiClient.get<ApiResponse<PaginatedProperties>>('/admin/properties', { params });
  return res.data.data!;
}

export async function adminGetPropertyApi(id: string): Promise<Property> {
  const res = await apiClient.get<ApiResponse<{ property: Property }>>(`/admin/properties/${id}`);
  return res.data.data!.property;
}

export async function adminReviewPropertyApi(
  id: string,
  payload: PropertyReviewPayload
): Promise<Property> {
  const res = await apiClient.patch<ApiResponse<{ property: Property }>>(
    `/admin/properties/${id}/review`,
    payload
  );
  return res.data.data!.property;
}
