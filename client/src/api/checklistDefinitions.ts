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

export type ChecklistDefinitionItem = {
  id: string;
  label: string;
  order: number;
  // Free-text grouping label (e.g. "Opening", "Closing", "Operational") — null items render in
  // an "Ungrouped" bucket.
  section: string | null;
  requiredImageCount: number;
  maxImageCount: number | null;
  requiresLivePhoto: boolean;
  itemType: ChecklistItemType;
  auditUserIds: string[];
  accessories: string[];
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
  // Two independent action sets — one per possible Yes/No answer — so an item can require e.g. a
  // photo when answered Yes AND a reason when answered No, both active at once.
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
  // Additive on top of the role-based verify rule (ADMIN/PC always, MANAGER/HOD own department
  // only) — naming someone here lets them approve/reject this checklist's instances regardless of
  // role or department.
  reviewerIds: string[];
  assigneeRoles: ChecklistAssigneeRole[];
  icon: ChecklistIcon;
  /** DAILY only: weekdays a run is created on (0 = Sunday … 6 = Saturday). Null = every day. */
  activeWeekdays: number[] | null;
  version: number;
  createdBy: string;
  items: ChecklistDefinitionItem[];
  // Computed server-side across every generated instance of this checklist — null until at
  // least one instance/qualifying item exists yet, rather than a misleading 0%.
  completionRate: number | null;
  qualityRate: number | null;
  // Share of gated Yes/No-style items (one branch wired with REQUIRE_PHOTO/ASK_REASON/
  // CREATE_ISSUE/NOTIFY_AREA_MANAGER) whose answer landed on that flagged branch. Higher is
  // worse; null when nothing on this checklist is actually gated that way.
  issueRate: number | null;
};

export type ApiResponse<T> = { success: boolean; data: T };

/** What saving an edit did to today's runs of a checklist: `refreshed` runs nobody had started were
 *  rebuilt from the edit; `updated` runs already had work in them and got the edit merged in, every
 *  answer kept; `kept` runs stay as they were (already sent for review or approved, or their store
 *  was taken out of the checklist). */
export type LiveRunsSummary = { refreshed: number; updated: number; kept: number };

export type CreateChecklistDefinitionItemPayload = {
  /** Id of the question as loaded from the server. Sent back on an edit so today's runs stay linked
   *  to their question (a rename or move then reaches a run that's already started). Ignored for a
   *  question the server doesn't know, so a new or copied one can carry any unique key. */
  id?: string;
  label: string;
  order?: number;
  section?: string | null;
  requiredImageCount?: number;
  maxImageCount?: number;
  requiresLivePhoto?: boolean;
  itemType?: ChecklistItemType;
  auditUserIds?: string[];
  accessories?: string[];
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
  items: CreateChecklistDefinitionItemPayload[];
};

// Builder's edit mode replaces the whole definition (name/schedule/items) in one PUT — same shape
// as create, plus `version`: whichever version the builder loaded the checklist at, so the server
// can reject the write (409) if someone else has saved a change since, instead of silently
// discarding it.
export type UpdateChecklistDefinitionPayload = CreateChecklistDefinitionPayload & { version: number };

export type ListChecklistDefinitionsParams = {
  storeId?: string;
  recurrence?: ChecklistRecurrence;
  isActive?: boolean;
  page?: number;
  limit?: number;
};

/**
 * Same page/limit response shape as ChecklistInstancePage (checklistInstances.ts) — the endpoint
 * used to be unbounded, hydrating every matching definition on every call.
 */
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

// Every array field on a definition and its items. The UI reads all of them without guards
// (`definition.items.some(...)`, `definition.assigneeIds.length`, `item.options.map(...)`), so a
// response missing any one of them throws where it's rendered rather than where it arrived —
// the exact failure mode that took the dashboard down when a task came back with no
// `additionalAssigneeIds`. Tasks, tickets and checklist *instances* were guarded then;
// definitions and templates were the two that never got the same treatment.
const definitionItemDefaults = withArrayDefaults({
  auditUserIds: arrayField(z.string()),
  accessories: arrayField(z.string()),
  options: arrayField(z.string()),
  signatureLabels: arrayField(z.string()),
  yesActions: arrayField(z.string()),
  noActions: arrayField(z.string()),
});

const definitionDefaults = withArrayDefaults({
  storeIds: arrayField(z.string()),
  assigneeIds: arrayField(z.string()),
  reviewerIds: arrayField(z.string()),
  assigneeRoles: arrayField(z.string()),
  items: arrayField(definitionItemDefaults),
});

const normalizeDefinition = (raw: unknown) => normalizeWith<ChecklistDefinition>(definitionDefaults, raw);
const normalizeDefinitions = (raw: unknown[]) => raw.map(normalizeDefinition);

export const checklistDefinitionApi = {
  getAll: (params: ListChecklistDefinitionsParams = {}) =>
    apiFetch<ApiResponse<ChecklistDefinition[]> & { meta: ChecklistDefinitionsPage }>(`/checklist-definitions${buildQuery({
      storeId: params.storeId,
      recurrence: params.recurrence,
      isActive: params.isActive === undefined ? undefined : String(params.isActive),
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
    apiFetch<ApiResponse<ChecklistDefinition> & { liveRuns?: LiveRunsSummary }>(`/checklist-definitions/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      .then((r) => ({ ...r, data: normalizeDefinition(r.data) })),

  setActive: (id: string, isActive: boolean) =>
    apiFetch<ApiResponse<ChecklistDefinition>>(`/checklist-definitions/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }).then((r) => ({ ...r, data: normalizeDefinition(r.data) })),

  remove: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/checklist-definitions/${id}`, { method: 'DELETE' }),
};
