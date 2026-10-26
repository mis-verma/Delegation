import { shrinkImages } from '../lib/compressImage';
import { apiFetch, type UploadProgress } from './http';
import { fileParts, uploadKeepingCopy } from '../lib/persistentUpload';
import type { ApiResponse } from './checklistDefinitions';
import type { CaptureMethod } from './ticket';
import type {
  ChecklistInstanceItemSubmission,
  ChecklistInstanceItemSubmissionAccessory,
  ChecklistInstanceItemSubmissionImage,
} from './checklistInstances';

export type ChecklistInstanceItemSubmissionDressTypeResult = ChecklistInstanceItemSubmission & {
  dressTypeId: string | null;
};

export const checklistInstanceItemSubmissionApi = {
  setDone: (id: string, isDone: boolean, options: { notApplicable?: boolean; remarks?: string } = {}) =>
    apiFetch<ApiResponse<ChecklistInstanceItemSubmission>>(`/checklist-instance-item-submissions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDone, ...options }),
    }),

  updateAccessories: (id: string, accessories: ChecklistInstanceItemSubmissionAccessory[]) =>
    apiFetch<ApiResponse<ChecklistInstanceItemSubmission>>(`/checklist-instance-item-submissions/${id}/accessories`, {
      method: 'PATCH',
      body: JSON.stringify({ accessories }),
    }),

  setDressType: (id: string, dressTypeId: string | null) =>
    apiFetch<ApiResponse<ChecklistInstanceItemSubmissionDressTypeResult>>(`/checklist-instance-item-submissions/${id}/dress-type`, {
      method: 'PATCH',
      body: JSON.stringify({ dressTypeId }),
    }),

  updateRemarks: (id: string, remarks: string | null) =>
    apiFetch<ApiResponse<ChecklistInstanceItemSubmission>>(`/checklist-instance-item-submissions/${id}/remarks`, {
      method: 'PATCH',
      body: JSON.stringify({ remarks }),
    }),

  uploadImages: async (submissionId: string, files: File[], captureMethod: CaptureMethod, onProgress?: UploadProgress) => {
    const shrunk = await shrinkImages(files);
    return uploadKeepingCopy<ApiResponse<ChecklistInstanceItemSubmissionImage[]>>(files, {
      path: `/checklist-instance-item-submissions/${submissionId}/images`,
      files: fileParts(shrunk, 'images'),
      fields: [['captureMethod', captureMethod]],
    }, onProgress);
  },

  deleteImage: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/checklist-instance-item-submission-images/${id}`, { method: 'DELETE' }),
};
