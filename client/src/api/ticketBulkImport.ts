import { apiFetch } from './http';
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
    tatHours?: string;
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
  categories: { id: string; name: string }[];
  tags: { id: string; name: string }[];
};

export type TicketBulkImportApplyRow = {
  /** Original row number from the uploaded file — so a failure in the publish summary points at
   *  a row the admin can actually find in their spreadsheet, not its position in this batch. */
  rowIndex: number;
  title: string;
  description: string;
  assigneeId?: string;
  priority?: Priority;
  departmentId?: string;
  storeId?: string;
  categoryId?: string;
  tatHours?: number;
  tagIds?: string[];
};

export type TicketBulkImportPublishPayload = { rows: TicketBulkImportApplyRow[] };

export type TicketBulkImportSummary = {
  created: number;
  failed: { rowIndex: number; message: string }[];
};

export const ticketBulkImportApi = {
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
