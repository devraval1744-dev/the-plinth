import axios, { AxiosError } from 'axios';
import type { ApiError } from '../types';

const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // Send httpOnly cookies with every request
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// ─── Request interceptor — attach tab-isolated token from sessionStorage ─────

apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('plinth_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor — normalise errors ─────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    // Let callers handle the structured error
    return Promise.reject(error);
  }
);

export default apiClient;

// ─── Helper to extract a readable message from an axios error ────────────────

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    if (data?.message) return data.message;
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function getFieldErrors(error: unknown): Record<string, string> {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    if (data?.errors) {
      return Object.fromEntries(data.errors.map((e) => [e.field, e.message]));
    }
  }
  return {};
}
