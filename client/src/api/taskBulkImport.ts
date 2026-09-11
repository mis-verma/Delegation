import { apiFetch } from './http';

export type ApiResponse<T> = { success: boolean; data: T };

export type BulkImportMatchConfidence = 'exact' | 'fuzzy' | 'none';

export type TaskBulkImportDateField = { raw: string; iso: string | null; valid: boolean };

export type TaskBulkImportMatchedRow = {
  rowIndex: number;
  raw: {
    title: string;
    description?: string;
    assigneeName?: string;
    priority?: string;
    departmentName?: string;
    labelNames: string[];
  };
  assigneeId: string | null;
  assigneeMatchConfidence: BulkImportMatchConfidence;
  departmentId: string | null;
  departmentMatchConfidence: BulkImportMatchConfidence;
  priority: 'low' | 'medium' | 'high';
  priorityMatched: boolean;
  startDate: TaskBulkImportDateField;
  dueDate: TaskBulkImportDateField;
  tagIds: string[];
  unmatchedLabelNames: string[];
};

export type TaskBulkImportPreviewResponse = {
  rows: TaskBulkImportMatchedRow[];
  assignableUsers: { id: string; name: string; email: string }[];
  departments: { id: string; name: string }[];
  tags: { id: string; name: string }[];
};

export type TaskBulkImportApplyRow = {
  /** Original row number from the uploaded file — so a failure in the publish summary points at
   *  a row the admin can actually find in their spreadsheet, not its position in this batch. */
  rowIndex: number;
  title: string;
  description?: string;
  assigneeId?: string;
  priority?: 'low' | 'medium' | 'high';
  startDate?: string;
  dueDate?: string;
  departmentId?: string;
  tagIds?: string[];
};

export type TaskBulkImportPublishPayload = { rows: TaskBulkImportApplyRow[] };

export type TaskBulkImportSummary = {
  created: number;
  failed: { rowIndex: number; message: string }[];
};

export const taskBulkImportApi = {
  preview: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch<ApiResponse<TaskBulkImportPreviewResponse>>('/tasks/bulk-import/preview', {
      method: 'POST',
      body: formData,
    });
  },

  publish: (payload: TaskBulkImportPublishPayload) =>
    apiFetch<ApiResponse<TaskBulkImportSummary>>('/tasks/bulk-import/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
