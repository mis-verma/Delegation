import { apiFetch } from './http';
import type { ApiResponse } from './checklistDefinitions';
import type { CaptureMethod } from './ticket';
import type {
  ChecklistInstanceItemSubmission,
  ChecklistInstanceItemSubmissionAccessory,
  ChecklistInstanceItemSubmissionImage,
} from './checklistInstances';

export const checklistInstanceItemSubmissionApi = {
  /** `notApplicable` marks this one person as not checkable today; it needs a reason in `remarks`. */
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

  updateRemarks: (id: string, remarks: string | null) =>
    apiFetch<ApiResponse<ChecklistInstanceItemSubmission>>(`/checklist-instance-item-submissions/${id}/remarks`, {
      method: 'PATCH',
      body: JSON.stringify({ remarks }),
    }),

  uploadImages: (submissionId: string, files: File[], captureMethod: CaptureMethod) => {
    const formData = new FormData();
    files.forEach(f => formData.append('images', f));
    formData.append('captureMethod', captureMethod);
    return apiFetch<ApiResponse<ChecklistInstanceItemSubmissionImage[]>>(`/checklist-instance-item-submissions/${submissionId}/images`, {
      method: 'POST',
      body: formData,
    });
  },

  deleteImage: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/checklist-instance-item-submission-images/${id}`, { method: 'DELETE' }),
};
