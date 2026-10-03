import { apiFetch } from './http';

export type ChecklistDecisionAction = 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'SUBMIT';

/** One entry of the decisions feed: who did what to which run, read from the audit trail. */
export type ChecklistDecision = {
  /** Audit log row id, unique per entry (a run can appear several times). */
  id: string;
  instanceId: string;
  title: string;
  storeName: string | null;
  action: ChecklistDecisionAction;
  /** ISO timestamp. */
  at: string;
  actorName: string;
  /** Approval note, rejection reason or send-back note. */
  note: string | null;
  /** Number of questions sent back; null for the other actions. */
  itemCount: number | null;
};

export type ChecklistDecisionParams = {
  /** ISO datetime or org-local YYYY-MM-DD. Default: start of today (org-local). */
  from?: string;
  /** ISO datetime or org-local YYYY-MM-DD (the whole day is included). Default: now. */
  to?: string;
  /** 1 to 200, default 200. */
  limit?: number;
};

export const checklistDecisionApi = {
  /** Newest first. ADMIN/PC see every run; MANAGER/SENIOR their own department's. */
  list: ({ from, to, limit }: ChecklistDecisionParams = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (limit) params.set('limit', String(limit));
    const query = params.toString();
    return apiFetch<{ success: boolean; data: ChecklistDecision[] }>(`/checklist-instances/decisions${query ? `?${query}` : ''}`)
      .then((r) => r.data);
  },
};
