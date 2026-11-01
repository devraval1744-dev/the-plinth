import apiClient from './client';
import type { ApiResponse, CreateLoanPayload, DsaLeadStatus, LoanRequest } from '../types';

// ─── Customer ────────────────────────────────────────────────────────────────

export async function createLoanApi(payload: CreateLoanPayload): Promise<LoanRequest> {
  const res = await apiClient.post<ApiResponse<{ loan: LoanRequest }>>('/loans', payload);
  return res.data.data!.loan;
}

export async function listMyLoansApi(): Promise<LoanRequest[]> {
  const res = await apiClient.get<ApiResponse<{ loans: LoanRequest[] }>>('/loans/mine');
  return res.data.data!.loans;
}

export async function cancelLoanApi(id: string): Promise<LoanRequest> {
  const res = await apiClient.patch<ApiResponse<{ loan: LoanRequest }>>(`/loans/${id}/cancel`);
  return res.data.data!.loan;
}

// ─── DSA ─────────────────────────────────────────────────────────────────────

export async function listLeadsApi(): Promise<LoanRequest[]> {
  const res = await apiClient.get<ApiResponse<{ leads: LoanRequest[] }>>('/loans/leads');
  return res.data.data!.leads;
}

export interface LeadCounts {
  assigned: number;
  active: number;
  completed: number;
  total: number;
}

export async function getLeadCountsApi(): Promise<LeadCounts> {
  const res = await apiClient.get<ApiResponse<LeadCounts>>('/loans/leads/counts');
  return res.data.data!;
}

export async function updateLeadStatusApi(
  id: string,
  status: DsaLeadStatus,
  note?: string
): Promise<LoanRequest> {
  const res = await apiClient.patch<ApiResponse<{ lead: LoanRequest }>>(`/loans/${id}/status`, { status, note });
  return res.data.data!.lead;
}
