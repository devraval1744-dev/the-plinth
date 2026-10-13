import apiClient from './client';
import type { User, SignupFormData, LoginFormData, ApiResponse } from '../types';

interface AuthData {
  user: User;
  token?: string;
}

export async function signupApi(data: SignupFormData): Promise<User> {
  const response = await apiClient.post<ApiResponse<AuthData>>('/auth/signup', data);
  const result = response.data.data!;
  if (result.token) {
    sessionStorage.setItem('plinth_access_token', result.token);
  }
  return result.user;
}

export async function loginApi(data: LoginFormData): Promise<User> {
  const response = await apiClient.post<ApiResponse<AuthData>>('/auth/login', data);
  const result = response.data.data!;
  if (result.token) {
    sessionStorage.setItem('plinth_access_token', result.token);
  }
  return result.user;
}

export async function logoutApi(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } finally {
    sessionStorage.removeItem('plinth_access_token');
  }
}

export async function getMeApi(): Promise<User> {
  const response = await apiClient.get<ApiResponse<AuthData>>('/auth/me');
  return response.data.data!.user;
}

export async function changePasswordApi(data: { currentPassword: string; newPassword: string }): Promise<User> {
  const response = await apiClient.post<ApiResponse<AuthData>>('/auth/change-password', data);
  const result = response.data.data!;
  if (result.token) {
    sessionStorage.setItem('plinth_access_token', result.token);
  }
  return result.user;
}


