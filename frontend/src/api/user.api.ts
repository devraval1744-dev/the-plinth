import apiClient from './client';
import type {
  User,
  UserProfileResponse,
  UpdateProfileFormData,
  ChangePasswordFormData,
  ApiResponse,
} from '../types';

export async function getProfileApi(): Promise<UserProfileResponse> {
  const response = await apiClient.get<ApiResponse<UserProfileResponse>>('/users/me');
  return response.data.data!;
}

export async function updateProfileApi(data: UpdateProfileFormData): Promise<UserProfileResponse> {
  const response = await apiClient.patch<ApiResponse<UserProfileResponse>>('/users/me', data);
  return response.data.data!;
}

export async function changeUserPasswordApi(data: ChangePasswordFormData): Promise<User> {
  const response = await apiClient.patch<ApiResponse<{ user: User; token: string }>>('/users/me/password', data);
  const result = response.data.data!;
  if (result.token) {
    sessionStorage.setItem('plinth_access_token', result.token);
  }
  return result.user;
}

export async function adminGetUserStatsApi(): Promise<{ total: number }> {
  const response = await apiClient.get<ApiResponse<{ total: number }>>('/admin/users/stats');
  return response.data.data!;
}

