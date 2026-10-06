import { apiFetch } from './http';
import type { ApiResponse } from './checklistDefinitions';

export type ApprovalTatCounts = { met: number; breached: number; pending: number };

/**
 * How well hand-ins for approval were answered within the 24 hour promise, for delegations, tickets
 * and checklist runs handed in during a window. `rate` is null until something has come due.
 */
export type ApprovalTat = ApprovalTatCounts & {
  windowHours: number;
  rate: number | null;
  byKind: { delegation: ApprovalTatCounts; ticket: ApprovalTatCounts; checklist: ApprovalTatCounts };
};

export const approvalTatApi = {
  /** ADMIN and PC only (the server refuses everyone else). */
  get: (from: string, to: string) =>
    apiFetch<ApiResponse<ApprovalTat>>(`/reports/approval-tat?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
};
