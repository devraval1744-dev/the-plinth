import apiClient from './client';
import type { ApiResponse, AppNotification } from '../types';

export async function listNotificationsApi(
  limit = 30
): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  const res = await apiClient.get<ApiResponse<{ notifications: AppNotification[]; unreadCount: number }>>(
    '/notifications',
    { params: { limit } }
  );
  return res.data.data!;
}

export async function getUnreadCountApi(): Promise<number> {
  const res = await apiClient.get<ApiResponse<{ count: number }>>('/notifications/unread-count');
  return res.data.data!.count;
}

export async function markNotificationReadApi(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsReadApi(): Promise<void> {
  await apiClient.patch('/notifications/read-all');
}
