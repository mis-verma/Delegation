import { apiFetch } from './http';
import type { Role } from './auth';

export type ApprovalCoverRow = {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  fromRole: Role;
  fromDepartmentId: string | null;
  startsAt: string;
  endsAt: string;
  note: string | null;
  active: boolean;
};

export type ApprovalCoverList = { given: ApprovalCoverRow[]; received: ApprovalCoverRow[] };

export type CoverPerson = { id: string; name: string; role: string; departmentId: string | null };

export type NewApprovalCover = { toUserId: string; startsAt?: string; endsAt: string; note?: string };

export const approvalCoverApi = {
  list: () => apiFetch<{ success: boolean; data: ApprovalCoverList }>('/approval-cover').then((r) => r.data),

  people: () => apiFetch<{ success: boolean; data: CoverPerson[] }>('/approval-cover/people').then((r) => r.data),

  create: (payload: NewApprovalCover) =>
    apiFetch<{ success: boolean; data: { id: string } }>('/approval-cover', { method: 'POST', body: JSON.stringify(payload) }),

  remove: (id: string) => apiFetch<{ success: boolean }>(`/approval-cover/${id}`, { method: 'DELETE' }),
};
