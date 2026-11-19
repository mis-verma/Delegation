import { apiFetch, refreshAccessToken } from './http';
import { tokenStore } from '../lib/tokenStore';
import { downloadBlob } from '../lib/exportTable';

export type ApiResponse<T> = { success: boolean; data: T };

export type BulkImportMatchConfidence = 'exact' | 'fuzzy' | 'none';

export type BulkImportMatchedRow = {
  rowIndex: number;
  raw: { checklistName: string; storeName: string; personName: string; department?: string };
  checklistDefinitionId: string | null;
  checklistMatchConfidence: BulkImportMatchConfidence;
  storeId: string | null;
  storeMatchConfidence: BulkImportMatchConfidence;
  userId: string | null;
  userMatchConfidence: BulkImportMatchConfidence;
};

export type BulkImportPreviewResponse = {
  rows: BulkImportMatchedRow[];
  checklists: { id: string; name: string }[];
  stores: { id: string; name: string }[];
  users: { id: string; name: string; email: string }[];
  warnings: string[];
};

export type BulkImportApplyRow = { checklistDefinitionId: string; storeId: string; userId: string };

export type BulkImportPublishPayload = {
  rows: BulkImportApplyRow[];
  startDate?: string;
  opensTime?: string;
  cutoffTime?: string;
};

export type BulkImportSummary = {
  updatedDefinitions: number;
  storesAdded: number;
  assigneesAdded: number;
  failed: { definitionId: string; message: string }[];
};

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

export const checklistBulkImportApi = {
  downloadTemplate: async () => {
    const send = async (token: string | null) => {
      try {
        return await fetch(`${BASE}/checklist-definitions/bulk-import/template`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
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
    downloadBlob(await res.blob(), 'checklist-import-template.xlsx');
  },

  preview: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch<ApiResponse<BulkImportPreviewResponse>>('/checklist-definitions/bulk-import/preview', {
      method: 'POST',
      body: formData,
    });
  },

  publish: (payload: BulkImportPublishPayload) =>
    apiFetch<ApiResponse<BulkImportSummary>>('/checklist-definitions/bulk-import/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
