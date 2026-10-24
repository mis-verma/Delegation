import { shrinkImages } from '../lib/compressImage';
import { apiFetch } from './http';
import { arrayField, withArrayDefaults, normalizeWith, n } from './normalize';

export type CaptureMethod = 'LIVE' | 'GALLERY';

export type TaskImage = {
  id:                  string;
  url:                 string;
  originalFilename:    string | null;
  mimeType:            string;
  sizeBytes:           number;
  captureMethod:       CaptureMethod;
  taskChecklistItemId: string;
  uploadedBy:          string;
  createdAt:           string;
};

export type TaskChecklistItem = {
  id:                 string;
  label:              string;
  isDone:             boolean;
  assigneeId:         string | null;
  dueAt:              string | null;
  completedAt:        string | null;
  taskChecklistId:    string;
  requiredImageCount: number;
  maxImageCount:      number | null;
  requiresLivePhoto:  boolean;
  remarks:            string | null;
  images:             TaskImage[];
};

export type TaskChecklist = {
  id:     string;
  title:  string;
  taskId: string;
  items:  TaskChecklistItem[];
};

export type ApiResponse<T> = { success: boolean; data: T };

export type CreateTaskChecklistItemPayload = {
  label:               string;
  assigneeId?:         string;
  dueAt?:              string;
  requiredImageCount?: number;
  maxImageCount?:      number;
  requiresLivePhoto?:  boolean;
  remarks?:            string;
};

export type CreateTaskChecklistPayload = {
  title:  string;
  items?: CreateTaskChecklistItemPayload[];
};

export type UpdateTaskChecklistItemPayload = {
  label?:              string;
  assigneeId?:         string | null;
  dueAt?:              string | null;
  requiredImageCount?: number;
  maxImageCount?:      number | null;
  requiresLivePhoto?:  boolean;
  isDone?:             false;
};

const taskChecklistItemDefaults = withArrayDefaults({ images: arrayField(n.unknown()) });
export const taskChecklistDefaults = withArrayDefaults({ items: arrayField(taskChecklistItemDefaults) });
const normalizeChecklist = (raw: unknown) => normalizeWith<TaskChecklist>(taskChecklistDefaults, raw);
const normalizeChecklistItem = (raw: unknown) => normalizeWith<TaskChecklistItem>(taskChecklistItemDefaults, raw);

export const taskChecklistApi = {
  create: (taskId: string, payload: CreateTaskChecklistPayload) =>
    apiFetch<ApiResponse<TaskChecklist>>(`/tasks/${taskId}/checklists`, {
      method: 'POST',
      body:   JSON.stringify(payload),
    }).then(r => ({ ...r, data: normalizeChecklist(r.data) })),

  deleteChecklist: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/task-checklists/${id}`, { method: 'DELETE' }),

  updateItem: (id: string, payload: UpdateTaskChecklistItemPayload) =>
    apiFetch<ApiResponse<TaskChecklistItem>>(`/task-checklist-items/${id}`, {
      method: 'PATCH',
      body:   JSON.stringify(payload),
    }).then(r => ({ ...r, data: normalizeChecklistItem(r.data) })),

  updateRemarks: (id: string, remarks: string) =>
    apiFetch<ApiResponse<TaskChecklistItem>>(`/task-checklist-items/${id}/remarks`, {
      method: 'PATCH',
      body:   JSON.stringify({ remarks }),
    }).then(r => ({ ...r, data: normalizeChecklistItem(r.data) })),

  completeItem: (id: string) =>
    apiFetch<ApiResponse<TaskChecklistItem>>(`/task-checklist-items/${id}/complete`, { method: 'POST' })
      .then(r => ({ ...r, data: normalizeChecklistItem(r.data) })),

  deleteItem: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/task-checklist-items/${id}`, { method: 'DELETE' }),

  uploadImages: async (itemId: string, files: File[], captureMethod: CaptureMethod) => {
    const formData = new FormData();
    (await shrinkImages(files)).forEach(f => formData.append('images', f));
    formData.append('captureMethod', captureMethod);
    return apiFetch<ApiResponse<TaskImage[]>>(`/task-checklist-items/${itemId}/images`, {
      method: 'POST',
      body:   formData,
    });
  },

  deleteImage: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/task-images/${id}`, { method: 'DELETE' }),
};
