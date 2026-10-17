import { apiFetch } from "./http";

export type DraftKind = 'TICKET' | 'CHECKLIST';

export type Draft<P = Record<string, unknown>> = {
    id: string;
    kind: DraftKind;
    title: string;
    payload: P;
    createdAt: string;
    updatedAt: string;
};

type ApiResponse<T> = { success: boolean; data: T };

export type SaveDraftPayload = { kind: DraftKind; title?: string; payload: Record<string, unknown> };

export const draftApi = {
    list: (kind: DraftKind) =>
        apiFetch<ApiResponse<Draft[]>>(`/drafts?kind=${kind}`).then(r => r.data),
    create: (payload: SaveDraftPayload) =>
        apiFetch<ApiResponse<Draft>>("/drafts", { method: "POST", body: JSON.stringify(payload) }).then(r => r.data),
    update: (id: string, payload: { title?: string; payload?: Record<string, unknown> }) =>
        apiFetch<ApiResponse<Draft>>(`/drafts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }).then(r => r.data),
    remove: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/drafts/${id}`, { method: "DELETE" }),
};
