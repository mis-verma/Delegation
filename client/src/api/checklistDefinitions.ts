import { z } from 'zod';
import { apiFetch } from './http';
import { arrayField, withArrayDefaults, normalizeWith } from './normalize';

export type ChecklistRecurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME';

export type ChecklistItemType =
  | 'STANDARD' | 'AUDIT' | 'NUMBER_ENTRY' | 'RATING'
  | 'YES_NO' | 'PASS_FAIL' | 'MULTIPLE_CHOICE' | 'DROPDOWN' | 'TEXT_BOX' | 'DATE_TIME'
  | 'GPS' | 'SIGNATURE' | 'DUAL_SIGNATURE' | 'QR_SCAN' | 'CASH_TALLY' | 'VIDEO_UPLOAD';

export type ChecklistAssigneeRole =
  | 'STORE_MANAGER' | 'FLOOR_MANAGER' | 'CASHIER' | 'SECURITY' | 'HOUSEKEEPING' | 'OPERATIONS';

export type ChecklistIcon =
  | 'store' | 'clock' | 'star' | 'check' | 'shield' | 'alert-triangle' | 'hash' | 'shield-check' | 'calendar';

export type ChecklistConditionalAction = 'REQUIRE_PHOTO' | 'ASK_REASON' | 'CREATE_ISSUE' | 'NOTIFY_AREA_MANAGER';

export type ChecklistResponseMode = 'SHARED' | 'PER_DEPARTMENT' | 'PER_USER';

export type ChecklistDefinitionItem = {
  id: string;
  label: string;
  order: number;
  section: string | null;
  requiredImageCount: number;
  maxImageCount: number | null;
  requiresLivePhoto: boolean;
  isCritical: boolean;
  itemType: ChecklistItemType;
  auditUserIds: string[];
  accessories: string[];
  accessoriesFemale: string[];
  accessoriesMale: string[];
  accessoriesByType: Record<string, string[]> | null;
  numberEntryUnit: string | null;
  numberEntryMin: number | null;
  numberEntryMax: number | null;
  ratingScale: number | null;
  options: string[];
  gpsTargetLat: number | null;
  gpsTargetLng: number | null;
  gpsRadiusMeters: number | null;
  signatureLabels: string[];
  qrExpectedValue: string | null;
  cashExpectedAmount: number | null;
  acceptableAnswers: string[] | null;
  acceptableMin: number | null;
  acceptableMax: number | null;
  yesActions: ChecklistConditionalAction[];
  noActions: ChecklistConditionalAction[];
  definitionId: string;
};

export type ChecklistDefinition = {
  id: string;
  name: string;
  description: string | null;
  storeIds: string[];
  recurrence: ChecklistRecurrence;
  startDate: string;
  opensTime: string | null;
  cutoffTime: string | null;
  isActive: boolean;
  assigneeIds: string[];
  reviewerIds: string[];
  assigneeRoles: ChecklistAssigneeRole[];
  icon: ChecklistIcon;
  activeWeekdays: number[] | null;
  responseMode: ChecklistResponseMode;
  departmentNames: string[];
  version: number;
  createdBy: string;
  items: ChecklistDefinitionItem[];
  completionRate: number | null;
  currentRate: number | null;
  qualityRate: number | null;
  issueRate: number | null;
};

export type ApiResponse<T> = { success: boolean; data: T };

export type LiveRunsSummary = { refreshed: number; updated: number; kept: number };

export type CreateChecklistDefinitionItemPayload = {
  id?: string;
  label: string;
  order?: number;
  section?: string | null;
  requiredImageCount?: number;
  maxImageCount?: number;
  requiresLivePhoto?: boolean;
  isCritical?: boolean;
  itemType?: ChecklistItemType;
  auditUserIds?: string[];
  accessories?: string[];
  accessoriesFemale?: string[];
  accessoriesMale?: string[];
  accessoriesByType?: Record<string, string[]>;
  numberEntryUnit?: string;
  numberEntryMin?: number;
  numberEntryMax?: number;
  ratingScale?: number;
  options?: string[];
  gpsTargetLat?: number;
  gpsTargetLng?: number;
  gpsRadiusMeters?: number;
  signatureLabels?: string[];
  qrExpectedValue?: string;
  cashExpectedAmount?: number;
  acceptableAnswers?: string[];
  acceptableMin?: number;
  acceptableMax?: number;
  yesActions?: ChecklistConditionalAction[];
  noActions?: ChecklistConditionalAction[];
};

export type CreateChecklistDefinitionPayload = {
  name: string;
  description?: string;
  storeIds: string[];
  recurrence: ChecklistRecurrence;
  startDate: string;
  opensTime?: string;
  cutoffTime?: string;
  assigneeIds: string[];
  reviewerIds?: string[];
  assigneeRoles?: ChecklistAssigneeRole[];
  icon?: ChecklistIcon;
  activeWeekdays?: number[] | null;
  responseMode?: ChecklistResponseMode;
  items: CreateChecklistDefinitionItemPayload[];
};

export type UpdateChecklistDefinitionPayload = CreateChecklistDefinitionPayload & { version: number };

export type ListChecklistDefinitionsParams = {
  storeId?: string;
  recurrence?: ChecklistRecurrence;
  isActive?: boolean;
  draft?: boolean;
  page?: number;
  limit?: number;
};

export type ChecklistDefinitionsPage = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
};

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

const definitionItemDefaults = withArrayDefaults({
  auditUserIds: arrayField(z.string()),
  accessories: arrayField(z.string()),
  accessoriesFemale: arrayField(z.string()),
  accessoriesMale: arrayField(z.string()),
  accessoriesByType: z.record(z.string(), z.array(z.string())).nullable().catch(null),
  options: arrayField(z.string()),
  signatureLabels: arrayField(z.string()),
  yesActions: arrayField(z.string()),
  noActions: arrayField(z.string()),
});

const definitionDefaults = withArrayDefaults({
  storeIds: arrayField(z.string()),
  assigneeIds: arrayField(z.string()),
  departmentNames: arrayField(z.string()),
  reviewerIds: arrayField(z.string()),
  assigneeRoles: arrayField(z.string()),
  items: arrayField(definitionItemDefaults),
});

const normalizeDefinition = (raw: unknown) => normalizeWith<ChecklistDefinition>(definitionDefaults, raw);
const normalizeDefinitions = (raw: unknown[]) => raw.map(normalizeDefinition);

export type ChecklistScoringGap = {
  id: string;
  name: string;
  recurrence: ChecklistRecurrence;
  scorable: number;
  unscored: number;
  labels: string[];
};

export const checklistDefinitionApi = {
  getScoringGaps: () => apiFetch<ApiResponse<ChecklistScoringGap[]>>('/checklist-definitions/scoring-gaps'),

  getAll: (params: ListChecklistDefinitionsParams = {}) =>
    apiFetch<ApiResponse<ChecklistDefinition[]> & { meta: ChecklistDefinitionsPage }>(`/checklist-definitions${buildQuery({
      storeId: params.storeId,
      recurrence: params.recurrence,
      isActive: params.isActive === undefined ? undefined : String(params.isActive),
      draft: params.draft === undefined ? undefined : String(params.draft),
      page: params.page === undefined ? undefined : String(params.page),
      limit: params.limit === undefined ? undefined : String(params.limit),
    })}`).then((r) => ({ ...r, data: normalizeDefinitions(r.data) })),

  getOne: (id: string) =>
    apiFetch<ApiResponse<ChecklistDefinition>>(`/checklist-definitions/${id}`).then((r) => ({
      ...r,
      data: normalizeDefinition(r.data),
    })),

  create: (payload: CreateChecklistDefinitionPayload) =>
    apiFetch<ApiResponse<ChecklistDefinition>>('/checklist-definitions', { method: 'POST', body: JSON.stringify(payload) })
      .then((r) => ({ ...r, data: normalizeDefinition(r.data) })),

  update: (id: string, payload: UpdateChecklistDefinitionPayload) =>
    apiFetch<ApiResponse<ChecklistDefinition> & { liveRuns?: LiveRunsSummary; wentLive?: boolean; paused?: boolean; lateToday?: boolean }>(`/checklist-definitions/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      .then((r) => ({ ...r, data: normalizeDefinition(r.data) })),

  setActive: (id: string, isActive: boolean) =>
    apiFetch<ApiResponse<ChecklistDefinition>>(`/checklist-definitions/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }).then((r) => ({ ...r, data: normalizeDefinition(r.data) })),

  remove: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/checklist-definitions/${id}`, { method: 'DELETE' }),

  restore: (id: string) =>
    apiFetch<ApiResponse<unknown>>(`/checklist-definitions/${id}/restore`, { method: 'POST' }),
};
