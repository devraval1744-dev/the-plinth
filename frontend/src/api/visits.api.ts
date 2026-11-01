import apiClient from './client';
import type { ApiResponse, CreateVisitPayload, RespondVisitPayload, SiteVisit } from '../types';

// ─── Customer ────────────────────────────────────────────────────────────────

export async function createVisitApi(payload: CreateVisitPayload): Promise<SiteVisit> {
  const res = await apiClient.post<ApiResponse<{ visit: SiteVisit }>>('/visits', payload);
  return res.data.data!.visit;
}

export async function listMyVisitsApi(): Promise<SiteVisit[]> {
  const res = await apiClient.get<ApiResponse<{ visits: SiteVisit[] }>>('/visits/mine');
  return res.data.data!.visits;
}

export async function cancelVisitApi(id: string): Promise<SiteVisit> {
  const res = await apiClient.patch<ApiResponse<{ visit: SiteVisit }>>(`/visits/${id}/cancel`);
  return res.data.data!.visit;
}

export async function acceptRescheduleApi(id: string): Promise<SiteVisit> {
  const res = await apiClient.patch<ApiResponse<{ visit: SiteVisit }>>(`/visits/${id}/accept-reschedule`);
  return res.data.data!.visit;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export async function listBuilderVisitsApi(): Promise<SiteVisit[]> {
  const res = await apiClient.get<ApiResponse<{ visits: SiteVisit[] }>>('/visits/builder');
  return res.data.data!.visits;
}

export async function getBuilderVisitCountsApi(): Promise<{ pending: number; confirmed: number; total: number }> {
  const res = await apiClient.get<ApiResponse<{ pending: number; confirmed: number; total: number }>>(
    '/visits/builder/counts'
  );
  return res.data.data!;
}

export async function respondToVisitApi(id: string, payload: RespondVisitPayload): Promise<SiteVisit> {
  const res = await apiClient.patch<ApiResponse<{ visit: SiteVisit }>>(`/visits/${id}/respond`, payload);
  return res.data.data!.visit;
}
