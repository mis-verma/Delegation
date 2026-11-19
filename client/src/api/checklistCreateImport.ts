import { apiFetch, refreshAccessToken } from './http';
import { tokenStore } from '../lib/tokenStore';
import { downloadBlob } from '../lib/exportTable';
import type { ChecklistRecurrence } from './checklistDefinitions';

export type ApiResponse<T> = { success: boolean; data: T };

export type CreateImportMatchConfidence = 'exact' | 'fuzzy' | 'none';

export type CreateImportMatchedRow = {
  rowIndex: number;
  raw: { checklistName: string; recurrenceText: string; question: string; photoRequired: boolean; personName: string; storeName: string };
  recurrence: ChecklistRecurrence | null;
  personId: string | null;
  personMatchConfidence: CreateImportMatchConfidence;
  storeId: string | null;
  storeMatchConfidence: CreateImportMatchConfidence;
};

export type CreateImportGroupPreview = {
  key: string;
  checklistName: string;
  recurrence: ChecklistRecurrence | null;
  rowIndexes: number[];
  items: { label: string; photoRequired: boolean; conflict: boolean }[];
  personIds: string[];
  unmatchedPeople: string[];
  storeIds: string[];
  unmatchedStores: string[];
  opensTime: string | null;
  cutoffTime: string | null;
  lateUntilTime: string | null;
  timeConflict: boolean;
  timeProblems: string[];
};

export type CreateImportPreviewResponse = {
  rows: CreateImportMatchedRow[];
  groups: CreateImportGroupPreview[];
  stores: { id: string; name: string }[];
  users: { id: string; name: string; email: string }[];
  warnings: string[];
};

export type CreateImportGroupPayload = {
  name: string;
  recurrence: ChecklistRecurrence;
  storeIds: string[];
  assigneeIds: string[];
  items: { label: string; photoRequired: boolean }[];
  opensTime?: string;
  cutoffTime?: string;
  lateUntilTime?: string;
};

export type CreateImportPublishPayload = {
  groups: CreateImportGroupPayload[];
  startDate?: string;
  opensTime?: string;
  cutoffTime?: string;
  lateUntilTime?: string;
  responseMode?: 'SHARED' | 'PER_DEPARTMENT' | 'PER_USER';
};

export type CreateImportSummary = {
  created: number;
  failed: { name: string; message: string }[];
};

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

export const checklistCreateImportApi = {
  downloadTemplate: async () => {
    const send = async (token: string | null) => {
      try {
        return await fetch(`${BASE}/checklist-definitions/create-import/template`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      } catch {
        throw new Error('Network error. Check your connection and try again.');
      }
    };
    const token = tokenStore.get();
    let res = await send(token);
    if (res.status === 401 && token) {
      const fresh = await refreshAccessToken(token);
      if (!fresh) throw new Error('Your session has expired. Sign in again, then download the template.');
      res = await send(fresh);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message ?? 'Could not download the template');
    }
    downloadBlob(await res.blob(), 'checklist-create-template.xlsx');
  },

  preview: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch<ApiResponse<CreateImportPreviewResponse>>('/checklist-definitions/create-import/preview', {
      method: 'POST',
      body: formData,
    });
  },

  publish: (payload: CreateImportPublishPayload) =>
    apiFetch<ApiResponse<CreateImportSummary>>('/checklist-definitions/create-import/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
