import { apiFetch } from "./http";

// Trimmed mirror of client/src/api/checklistInstances.ts — same field names/shapes so the two
// clients stay swappable against the same backend contract. Only what the mobile fill-out flow
// needs so far (list mine / get one / update item / upload image); verification and the
// compliance report are admin-side concerns, not part of this first pass.

export type ChecklistItemType =
  | "STANDARD" | "AUDIT" | "NUMBER_ENTRY" | "RATING" | "YES_NO" | "PASS_FAIL"
  | "MULTIPLE_CHOICE" | "DROPDOWN" | "TEXT_BOX" | "DATE_TIME" | "GPS" | "SIGNATURE"
  | "DUAL_SIGNATURE" | "QR_SCAN" | "CASH_TALLY" | "VIDEO_UPLOAD";

export type ChecklistVerificationStatus = "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
export type CaptureMethod = "LIVE" | "GALLERY";

export type ChecklistInstanceImage = {
  id: string;
  url: string;
  checklistInstanceItemId: string;
  captureMethod: CaptureMethod;
};

export type ChecklistInstanceItem = {
  id: string;
  label: string;
  order: number;
  section: string | null;
  isDone: boolean;
  completedAt: string | null;
  requiredImageCount: number;
  maxImageCount: number | null;
  itemType: ChecklistItemType;
  numberEntryUnit: string | null;
  numberEntryMin: number | null;
  numberEntryMax: number | null;
  ratingScale: number | null;
  numericValue: number | null;
  options: string[];
  booleanAnswer: "YES" | "NO" | null;
  textValue: string | null;
  dateValue: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAccuracy: number | null;
  remarks: string | null;
  instanceId: string;
  images: ChecklistInstanceImage[];
};

export type ChecklistInstance = {
  id: string;
  title: string;
  storeId: string;
  opensTime: string | null;
  cutoffTime: string | null;
  assigneeIds: string[];
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  verificationStatus: ChecklistVerificationStatus;
  items: ChecklistInstanceItem[];
};

export type ChecklistInstanceStatus = "OPEN" | "DUE" | "COMPLETED" | "OVERDUE";

type ApiResponse<T> = { success: boolean; data: T };

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
};

export const checklistInstanceApi = {
  getMine: (filter: { status?: ChecklistInstanceStatus } = {}) =>
    apiFetch<ApiResponse<ChecklistInstance[]>>(`/checklist-instances/mine${buildQuery(filter)}`),

  getOne: (id: string) => apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}`),

  setItemDone: (
    itemId: string,
    isDone: boolean,
    values?: {
      numericValue?: number;
      booleanAnswer?: "YES" | "NO";
      textValue?: string;
      dateValue?: string;
      gpsLat?: number;
      gpsLng?: number;
      gpsAccuracy?: number;
      remarks?: string;
    },
  ) =>
    apiFetch<ApiResponse<ChecklistInstanceItem>>(`/checklist-instance-items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ isDone, ...values }),
    }),

  // React Native's FormData takes { uri, name, type } file parts rather than a browser File object.
  uploadImage: (itemId: string, file: { uri: string; name: string; type: string }, captureMethod: CaptureMethod) => {
    const formData = new FormData();
    // @ts-expect-error React Native's FormData accepts this file-part shape; the DOM lib types don't know it.
    formData.append("images", file);
    formData.append("captureMethod", captureMethod);
    return apiFetch<ApiResponse<ChecklistInstanceImage[]>>(`/checklist-instance-items/${itemId}/images`, {
      method: "POST",
      body: formData,
    });
  },
};
