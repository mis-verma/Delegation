import { apiFetch, refreshAccessToken } from './http';
import { tokenStore } from '../lib/tokenStore';
import { downloadBlob } from '../lib/exportTable';
import type { Priority } from './ticket';

export type ApiResponse<T> = { success: boolean; data: T };

export type BulkImportMatchConfidence = 'exact' | 'fuzzy' | 'none';

export type TicketBulkImportMatchedRow = {
  rowIndex: number;
  raw: {
    title: string;
    description?: string;
    assigneeName?: string;
    priority?: string;
    departmentName?: string;
    storeName?: string;
    categoryName?: string;
    subcategoryName?: string;
    tatHours?: string;
    dueDate?: string;
    labelNames: string[];
  };
  assigneeId: string | null;
  assigneeMatchConfidence: BulkImportMatchConfidence;
  departmentId: string | null;
  departmentMatchConfidence: BulkImportMatchConfidence;
  storeId: string | null;
  storeMatchConfidence: BulkImportMatchConfidence;
  categoryId: string | null;
  categoryMatchConfidence: BulkImportMatchConfidence;
  subcategoryId: string | null;
  subcategoryMatchConfidence: BulkImportMatchConfidence;
  subcategoryRequired: boolean;
  priority: Priority;
  priorityMatched: boolean;
  tatHours: number | null;
  tatHoursInvalid: boolean;
  tagIds: string[];
  unmatchedLabelNames: string[];
};

export type TicketBulkImportPreviewResponse = {
  rows: TicketBulkImportMatchedRow[];
  assignableUsers: { id: string; name: string; email: string }[];
  departments: { id: string; name: string }[];
  stores: { id: string; name: string }[];
  categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[];
  tags: { id: string; name: string }[];
};

export type TicketBulkImportApplyRow = {
  rowIndex: number;
  title: string;
  description: string;
  assigneeId?: string;
  priority?: Priority;
  departmentId?: string;
  storeId?: string;
  categoryId?: string;
  subcategoryId?: string;
  tatHours?: number;
  tagIds?: string[];
};

export type TicketBulkImportPublishPayload = { rows: TicketBulkImportApplyRow[] };

export type TicketBulkImportSummary = {
  created: number;
  failed: { rowIndex: number; message: string }[];
};

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

export const ticketBulkImportApi = {
  downloadTemplate: async () => {
    const send = async (token: string | null) => {
      try {
        return await fetch(`${BASE}/tickets/bulk-import/template`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
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
    downloadBlob(await res.blob(), 'ticket-import-template.xlsx');
  },


  preview: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch<ApiResponse<TicketBulkImportPreviewResponse>>('/tickets/bulk-import/preview', {
      method: 'POST',
      body: formData,
    });
  },

  publish: (payload: TicketBulkImportPublishPayload) =>
    apiFetch<ApiResponse<TicketBulkImportSummary>>('/tickets/bulk-import/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
