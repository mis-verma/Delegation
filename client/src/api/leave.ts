import { apiFetch } from './http';

export interface LeaveEntry {
  id: string;
  userId: string;
  userName: string;
  departmentName: string | null;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
  openTickets: number;
  openDelegations: number;
}

export interface NewLeave {
  userId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface LeavePreview {
  runs: number;
  openTickets: number;
  openDelegations: number;
}

export interface LeaveCreated extends LeavePreview {
  removedRuns: number;
}

export const leaveApi = {
  list: () => apiFetch<{ success: boolean; data: LeaveEntry[] }>('/leave').then((r) => r.data),
  preview: (params: { userId: string; startDate: string; endDate: string }) =>
    apiFetch<{ success: boolean; data: LeavePreview }>(`/leave/preview?${new URLSearchParams(params).toString()}`).then((r) => r.data),
  create: (payload: NewLeave) =>
    apiFetch<{ success: boolean; removedRuns: number; openTickets: number; openDelegations: number }>('/leave', { method: 'POST', body: JSON.stringify(payload) }),
  remove: (id: string) => apiFetch<{ success: boolean }>(`/leave/${id}`, { method: 'DELETE' }),
};
