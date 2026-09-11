import { apiFetch } from './http';

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

export const checklistBulkImportApi = {
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
