import { apiFetch } from '../../api/http';

type RunOptions = { keepalive: boolean };

const patch = (path: string, body: unknown, { keepalive }: RunOptions) =>
  apiFetch<unknown>(path, { method: 'PATCH', body: JSON.stringify(body), keepalive });

export interface ItemRemark {
  itemId: string;
  remark: string;
}

/** The reviewer's per-question notes ride with the decision, so approving is still one request. */
export const approveRun = (id: string, itemRemarks?: readonly ItemRemark[]) => (options: RunOptions) =>
  patch(
    `/checklist-instances/${id}/verify`,
    { action: 'APPROVE', ...(itemRemarks?.length ? { itemRemarks } : {}) },
    options,
  );

export const rejectRun = (id: string, note: string, fixByHours?: number | null) => (options: RunOptions) =>
  patch(`/checklist-instances/${id}/verify`, { action: 'REJECT', note, ...(fixByHours ? { fixByHours } : {}) }, options);

export const approveTicketRun = (id: string, note?: string) => (options: RunOptions) =>
  patch(`/tickets/${id}/verify`, { action: 'APPROVE', ...(note ? { note } : {}) }, options);

export interface ChecklistCorrection {
  correctionItemIds: string[];
  photoOnlyItemIds: string[];
}

const correctionBody = (correction?: ChecklistCorrection) => ({
  ...(correction?.correctionItemIds.length ? { correctionItemIds: correction.correctionItemIds } : {}),
  ...(correction?.photoOnlyItemIds.length ? { photoOnlyItemIds: correction.photoOnlyItemIds } : {}),
});

export const rejectTicketRun = (id: string, note: string, correction?: ChecklistCorrection) => (options: RunOptions) =>
  patch(`/tickets/${id}/verify`, { action: 'REJECT', note, ...correctionBody(correction) }, options);

export const approveTaskRun = (id: string, note?: string) => (options: RunOptions) =>
  patch(`/tasks/${id}/verify`, { action: 'APPROVE', ...(note ? { note } : {}) }, options);

export const rejectTaskRun = (id: string, note: string, correction?: ChecklistCorrection) => (options: RunOptions) =>
  patch(`/tasks/${id}/verify`, { action: 'REJECT', note, ...correctionBody(correction) }, options);

export const sendBackRun = (id: string, itemIds: string[], note: string, fixByHours?: number | null, photoOnlyItemIds?: string[]) => (options: RunOptions) =>
  patch(`/checklist-instances/${id}/send-back`, { itemIds, note, ...(fixByHours ? { fixByHours } : {}), ...(photoOnlyItemIds?.length ? { photoOnlyItemIds } : {}) }, options);
