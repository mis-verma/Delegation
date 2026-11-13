import { apiFetch } from './http';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

export interface LeaveEntry {
  id: string;
  userId: string;
  userName: string;
  departmentName: string | null;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  reason: string | null;
  declineNote: string | null;
  createdByName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
  openTickets: number;
  openDelegations: number;
  mine: boolean;
  canDecide: boolean;
  canRemove: boolean;
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

export interface LeaveRules {
  backdateDays: number;
}

export const leaveApi = {
  rules: () => apiFetch<{ success: boolean; data: LeaveRules }>('/leave/rules').then((r) => r.data),
  list: () => apiFetch<{ success: boolean; data: LeaveEntry[] }>('/leave').then((r) => r.data),
  preview: (params: { userId: string; startDate: string; endDate: string }) =>
    apiFetch<{ success: boolean; data: LeavePreview }>(`/leave/preview?${new URLSearchParams(params).toString()}`).then((r) => r.data),
  create: (payload: NewLeave) =>
    apiFetch<{ success: boolean; status: LeaveStatus; removedRuns: number; openTickets: number; openDelegations: number }>('/leave', { method: 'POST', body: JSON.stringify(payload) }),
  approve: (id: string) =>
    apiFetch<{ success: boolean; data: { status: LeaveStatus; removedRuns: number } }>(`/leave/${id}/approve`, { method: 'POST' }).then((r) => r.data),
  decline: (id: string, note?: string) =>
    apiFetch<{ success: boolean; data: { status: LeaveStatus; removedRuns: number } }>(`/leave/${id}/decline`, { method: 'POST', body: JSON.stringify({ note }) }).then((r) => r.data),
  remove: (id: string) => apiFetch<{ success: boolean }>(`/leave/${id}`, { method: 'DELETE' }),
};
