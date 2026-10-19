import { apiFetch } from './http';

export type ChecklistDecisionAction = 'APPROVE' | 'REJECT' | 'SEND_BACK' | 'SUBMIT';

export type ChecklistDecision = {
  id: string;
  instanceId: string;
  title: string;
  storeName: string | null;
  action: ChecklistDecisionAction;
  at: string;
  actorName: string;
  note: string | null;
  itemCount: number | null;
};

export type ChecklistDecisionParams = {
  from?: string;
  to?: string;
  limit?: number;
};

export const checklistDecisionApi = {
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
