import apiClient from './client';
import type {
  ApiResponse,
  CustomerDashboard,
  PropertyExplanation,
  RecommendationFeed,
  SavedProperty,
  SearchQuery,
} from '../types';

export async function getDashboardApi(): Promise<CustomerDashboard> {
  const res = await apiClient.get<ApiResponse<CustomerDashboard>>('/customer/dashboard');
  return res.data.data!;
}

export async function getRecommendationsApi(limit = 8): Promise<RecommendationFeed> {
  const res = await apiClient.get<ApiResponse<RecommendationFeed>>('/customer/recommendations', {
    params: { limit },
  });
  return res.data.data!;
}

export async function explainRecommendationApi(propertyId: string): Promise<PropertyExplanation> {
  const res = await apiClient.get<ApiResponse<PropertyExplanation>>(
    `/customer/recommendations/${propertyId}/explain`
  );
  return res.data.data!;
}

// ─── Saved properties ────────────────────────────────────────────────────────

export async function listFavoritesApi(): Promise<SavedProperty[]> {
  const res = await apiClient.get<ApiResponse<{ properties: SavedProperty[] }>>('/customer/favorites');
  return res.data.data!.properties;
}

export async function listFavoriteIdsApi(): Promise<string[]> {
  const res = await apiClient.get<ApiResponse<{ ids: string[] }>>('/customer/favorites/ids');
  return res.data.data!.ids;
}

export async function addFavoriteApi(propertyId: string): Promise<void> {
  await apiClient.post(`/customer/favorites/${propertyId}`);
}

export async function removeFavoriteApi(propertyId: string): Promise<void> {
  await apiClient.delete(`/customer/favorites/${propertyId}`);
}

// ─── Activity (feeds recommendations) ────────────────────────────────────────

export async function recordSearchApi(query: SearchQuery): Promise<void> {
  await apiClient.post('/customer/activity/search', query);
}

export async function clearHistoryApi(): Promise<void> {
  await apiClient.delete('/customer/activity/history');
}
