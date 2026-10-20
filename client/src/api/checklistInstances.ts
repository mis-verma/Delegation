import { shrinkImages } from '../lib/compressImage';
import { z } from 'zod';
import { apiFetch, type PendingApprovalPreview } from './http';
import { arrayField, withArrayDefaults, normalizeWith } from './normalize';
import type { ApiResponse, ChecklistRecurrence, ChecklistItemType, ChecklistConditionalAction } from './checklistDefinitions';
import type { CaptureMethod } from './ticket';

export type ChecklistInstanceStatus = 'OPEN' | 'DUE' | 'COMPLETED' | 'OVERDUE';
export type ChecklistVerificationStatus = 'NOT_SUBMITTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type ChecklistImagePurpose = 'GENERAL' | 'CONDITIONAL_YES' | 'CONDITIONAL_NO';

export type ChecklistInstanceImage = {
  id:                      string;
  url:                     string;
  originalFilename:        string | null;
  mimeType:                string;
  sizeBytes:               number;
  captureMethod:           CaptureMethod;
  purpose:                 ChecklistImagePurpose;
  checklistInstanceItemId: string;
  uploadedBy:              string;
  createdAt:               string;
};

export type ChecklistInstanceItemSubmissionImage = {
  id:             string;
  url:            string;
  originalFilename: string | null;
  mimeType:       string;
  sizeBytes:      number;
  captureMethod:  CaptureMethod;
  submissionId:   string;
  uploadedBy:     string;
  createdAt:      string;
};

export type ChecklistInstanceItemSubmissionAccessory = { name: string; checked: boolean };

export type ChecklistInstanceItemSubmissionUser = {
  id:        string;
  firstName: string;
  lastName:  string | null;
  storeId:   string | null;
  isActive?: boolean;
  gender?:   'FEMALE' | 'MALE' | null;
};

export type ChecklistAuditDressTypeOption = { id: string; name: string; gender: 'FEMALE' | 'MALE' | null };

export type ChecklistInstanceItemSubmission = {
  id:          string;
  itemId:      string;
  userId:      ChecklistInstanceItemSubmissionUser;
  accessories: ChecklistInstanceItemSubmissionAccessory[];
  remarks:     string | null;
  isDone:      boolean;
  isNotApplicable: boolean;
  completedAt: string | null;
  images:      ChecklistInstanceItemSubmissionImage[];
  dressType?:  { id: string; name: string } | null;
};

export type ChecklistInstanceItem = {
  id:                 string;
  label:              string;
  order:              number;
  section:            string | null;
  isDone:             boolean;
  completedAt:        string | null;
  completedBy:        string | null;
  completedByName:    string | null;
  requiredImageCount: number;
  maxImageCount:      number | null;
  requiresLivePhoto:  boolean;
  isCritical:         boolean;
  itemType:           ChecklistItemType;
  accessories:        string[];
  numberEntryUnit:    string | null;
  numberEntryMin:     number | null;
  numberEntryMax:     number | null;
  ratingScale:        number | null;
  numericValue:       number | null;
  options:            string[];
  booleanAnswer:      'YES' | 'NO' | null;
  textValue:          string | null;
  dateValue:          string | null;
  gpsTargetLat:       number | null;
  gpsTargetLng:       number | null;
  gpsRadiusMeters:    number | null;
  gpsLat:             number | null;
  gpsLng:             number | null;
  gpsAccuracy:        number | null;
  gpsCapturedAt:      string | null;
  signatureLabels:    string[];
  signatureValue:     string | null;
  secondSignatureValue: string | null;
  qrExpectedValue:    string | null;
  cashExpectedAmount: number | null;
  yesActions:         ChecklistConditionalAction[];
  noActions:          ChecklistConditionalAction[];
  acceptableAnswers:  string[] | null;
  acceptableMin:      number | null;
  acceptableMax:      number | null;
  conditionalReasonValue: string | null;
  remarks:            string | null;
  isNotApplicable:    boolean;
  sendBackNote:       string | null;
  sendBackCount:      number;
  waivedAt:           string | null;
  waivedBy:           string | null;
  waiveReason:        string | null;
  issueId:            string | null;
  reviewTicketId?:    string | null;
  instanceId:         string;
  images:             ChecklistInstanceImage[];
  submissions:        ChecklistInstanceItemSubmission[];
  dressTypeOptions?:  ChecklistAuditDressTypeOption[];
};

export type ChecklistInstance = {
  id:               string;
  definitionId:     string;
  title:            string;
  recurrence:       ChecklistRecurrence;
  storeId:          string;
  opensTime:        string | null;
  cutoffTime:       string | null;
  lateUntilTime?:   string | null;
  assigneeIds:      string[];
  reviewerIds:      string[];
  periodKey:        string;
  periodStart:      string;
  periodEnd:        string;
  generatedAt:      string;
  verificationStatus: ChecklistVerificationStatus;
  completedFirstAt?:  string | null;
  submittedAt:        string | null;
  submittedBy:        string | null;
  submittedByName:    string | null;
  isMissed?:          boolean;
  isEnded?:           boolean;
  isLate?:            boolean;
  endedAt?:           string;
  verifiedBy:         string | null;
  verifiedAt:         string | null;
  verificationNote:   string | null;
  items:            ChecklistInstanceItem[];
};

export type SendBackChecklistInstancePayload = { itemIds: string[]; note: string };
export type VerifyChecklistInstancePayload = { action: 'APPROVE' | 'REJECT'; note?: string };

export type ComplianceReportGroupBy = 'day' | 'week' | 'month' | 'year' | 'none';

export type ComplianceReportRow = {
  bucket: string;
  totalItems: number;
  doneItems: number;
  completionRate: number | null;
  itemsRequiringPhotos: number;
  qualityRate: number | null;
  gatedBooleanItems: number;
  issueRate: number | null;
  submittedInstances: number;
  firstAttemptApproved: number;
  approvalRate: number | null;
  complianceRate: number | null;
  scoredAnswers: number;
  dueRuns: number;
  pendingRuns?: number;
  weightedGood?: number;
  weightedScored?: number;
  itemsDonePct?: number | null;
  itemsDone?: number;
  itemsApplicable?: number;
  rankable?: boolean;
};

export type ChecklistStoreDailyRow = {
  storeId: string;
  storeName: string;
  day: string;
  completionRate: number | null;
  complianceRate: number | null;
  doneItems: number;
  totalItems: number;
  weightedGood: number;
  weightedScored: number;
  itemsDonePct?: number | null;
  itemsDone?: number;
  itemsApplicable?: number;
  rankable?: boolean;
  dueRuns: number;
};

export type ChecklistDepartmentMonthlyRow = {
  departmentId: string;
  departmentName: string;
  month: string;
  completionRate: number | null;
  complianceRate: number | null;
  doneItems: number;
  totalItems: number;
  weightedGood: number;
  weightedScored: number;
  itemsDonePct?: number | null;
  itemsDone?: number;
  itemsApplicable?: number;
  rankable?: boolean;
  dueRuns: number;
};

export type ChecklistScoreRun = {
  id: string;
  title: string;
  storeName: string;
  day: string;
  doneItems: number;
  totalItems: number;
  completionRate: number | null;
  complianceRate: number | null;
  verificationStatus: string;
};

export type ChecklistStoreComplianceRow = {
  storeId: string;
  storeName: string;
  completionRate: number | null;
  qualityRate: number | null;
  approvalRate: number | null;
  complianceRate: number | null;
  dueRuns: number;
  items: number;
  itemsDonePct?: number | null;
  itemsDone?: number;
  itemsApplicable?: number;
  weightedGood?: number;
  weightedScored?: number;
  rankable?: boolean;
};

const buildQuery = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const toDayParam = (value: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const checklistInstanceArrayDefaults = withArrayDefaults({
  assigneeIds: arrayField(z.string()),
  reviewerIds: arrayField(z.string()),
  items: arrayField(z.unknown()),
});
const normalizeInstance = (raw: unknown) => normalizeWith<ChecklistInstance>(checklistInstanceArrayDefaults, raw);
const normalizeInstances = (raw: unknown[]) => raw.map(normalizeInstance);

export type ChecklistInstancePage = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
};

type PageParams = { page?: number; limit?: number };

export type ChecklistInstanceSummary = {
  total: number;
  completed: number;
  pending: number;
  due: number;
  overdue: number;
  olderOpen?: number;
  missed: number;
  dueRuns: number;
  completionPct: number | null;
  notCounted: number;
  window: { from: string; to: string; asOf: string };
  totalItems: number;
  doneItems: number;
  newToday: number;
};

export type FormerPerson = {
  id:             string;
  firstName:      string;
  lastName:       string | null;
  role:           string;
  departmentName: string | null;
  storeName:      string | null;
  leftAt:         string;
  runsAssigned:   number;
  runsWorked:     number;
  auditsOnThem:   number;
};

export type FormerPersonName = {
  id:        string;
  firstName: string;
  lastName:  string | null;
  email:     string;
};

export type PersonRun = {
  id:                 string;
  title:              string;
  storeName:          string | null;
  periodStart:        string;
  verificationStatus: ChecklistVerificationStatus;
  total:              number;
  done:               number;
  theirs:             number;
};

export type AuditHistoryRow = {
  id:              string;
  itemLabel:       string;
  checklistTitle:  string;
  periodStart:     string;
  completedAt:     string | null;
  remarks:         string | null;
  isNotApplicable: boolean;
  storeId:         string;
  storeName:       string | null;
  personFirstName: string;
  personLastName:  string | null;
  personIsActive:  boolean;
  accessories:    ChecklistInstanceItemSubmissionAccessory[];
  images:         Pick<ChecklistInstanceItemSubmissionImage, 'id' | 'url' | 'originalFilename' | 'captureMethod' | 'createdAt'>[];
};

export type ChecklistPendingApproval = {
  id: string;
  title: string;
  storeName: string | null;
  waitingSince: string;
};

export type WeeklyCellState = 'done' | 'late' | 'missed' | 'open' | 'holiday' | 'off' | 'upcoming' | 'summary';
export type WeeklyCell = {
  date: string;
  state: WeeklyCellState;
  runId: string | null;
  done: number;
  total: number;
  compliance: number | null;
  due?: number;
  onTime?: number;
  late?: number;
  missed?: number;
  open?: number;
  rate?: number | null;
  completion?: number | null;
};
export type ReportScore = {
  due: number;
  completed: number;
  onTime: number;
  late: number;
  missed: number;
  open: number;
  rate: number | null;
  completion: number | null;
  compliance: number | null;
  onTimeOfFinishedPct: number | null;
  metDeadlinePct: number | null;
  rankable: boolean;
};
export type StoreScore = ReportScore & { storeId: string; storeName: string };
export type DepartmentScore = ReportScore & { departmentId: string; departmentName: string };
export type WeeklyReport = {
  from: string;
  to: string;
  weekStart: string;
  kind: 'day' | 'month';
  columns: { key: string; label: string }[];
  days: string[];
  holidays: Record<string, string>;
  rows: (ReportScore & { definitionId: string; scopeKey: string; name: string; storeId: string; storeName: string; cells: WeeklyCell[] })[];
  byStore: StoreScore[];
  summary: ReportScore;
};

export const checklistInstanceApi = {
  getMine: (
    filter: {
      status?: ChecklistInstanceStatus; storeId?: string; recurrence?: ChecklistRecurrence; verificationStatus?: ChecklistVerificationStatus; departmentId?: string; assigneeIds?: string[];
      from?: string; to?: string;
    } = {},
    paging: PageParams = {},
  ) =>
    apiFetch<ApiResponse<ChecklistInstance[]> & { meta: ChecklistInstancePage }>(
      `/checklist-instances/mine${buildQuery({
        ...filter,
        assigneeIds: filter.assigneeIds?.length ? filter.assigneeIds.join(',') : undefined,
        ...paging,
      })}`,
    ).then(r => ({ ...r, data: normalizeInstances(r.data) })),

  getFormerPeople: () =>
    apiFetch<ApiResponse<FormerPerson[]>>('/checklist-instances/former-people').then(r => r.data),

  getFormerPeopleNames: () =>
    apiFetch<ApiResponse<FormerPersonName[]>>('/checklist-instances/former-people/names').then(r => r.data),

  getPersonRuns: (userId: string, paging: PageParams = {}) =>
    apiFetch<ApiResponse<PersonRun[]> & { meta: ChecklistInstancePage }>(
      `/checklist-instances/former-people/${userId}/runs${buildQuery({ ...paging })}`,
    ),

  getAuditHistory: (filter: { storeId?: string; personId?: string; from?: string; to?: string } = {}, paging: PageParams = {}) =>
    apiFetch<ApiResponse<AuditHistoryRow[]> & { meta: ChecklistInstancePage }>(
      `/checklist-instances/audit-history${buildQuery({ ...filter, from: filter.from ? toDayParam(filter.from) : undefined, to: filter.to ? toDayParam(filter.to) : undefined, ...paging })}`,
    ),

  getSummary: (filter: {
    mine?: boolean;
    storeId?: string;
    assigneeId?: string;
    assigneeIds?: string[];
    definitionId?: string;
    recurrence?: ChecklistRecurrence;
    verificationStatus?: ChecklistVerificationStatus;
    departmentId?: string;
    from?: string;
    to?: string;
    includeDeleted?: boolean;
  } = {}) =>
    apiFetch<ApiResponse<ChecklistInstanceSummary>>(
      `/checklist-instances/summary${buildQuery({
        mine: filter.mine ? '1' : undefined,
        storeId: filter.storeId,
        assigneeId: filter.assigneeId,
        assigneeIds: filter.assigneeIds?.length ? filter.assigneeIds.join(',') : undefined,
        definitionId: filter.definitionId,
        recurrence: filter.recurrence,
        verificationStatus: filter.verificationStatus,
        departmentId: filter.departmentId,
        from: filter.from ? toDayParam(filter.from) : undefined,
        to: filter.to ? toDayParam(filter.to) : undefined,
        includeDeleted: filter.includeDeleted ? '1' : undefined,
      })}`,
    ),

  getPendingApprovalPreview: (): Promise<PendingApprovalPreview<ChecklistPendingApproval>> =>
    apiFetch<ApiResponse<ChecklistPendingApproval[]> & { meta?: { total: number } }>('/checklist-instances/pending-approval-preview')
      .then(r => ({ rows: r.data, total: r.meta?.total ?? r.data.length })),

  getOne: (id: string) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}`)
      .then(r => ({ ...r, data: normalizeInstance(r.data) })),

  getPeriodReport: (from: string, to: string, storeId?: string, departmentId?: string) =>
    apiFetch<ApiResponse<WeeklyReport>>(`/checklist-instances/reports/period${buildQuery({ from, to, storeId, departmentId })}`),

  getDepartmentScores: (from: string, to: string, storeId?: string) =>
    apiFetch<ApiResponse<DepartmentScore[]>>(`/checklist-instances/reports/departments${buildQuery({ from, to, storeId })}`),

  getForDefinition: (definitionId: string, paging: PageParams = {}) =>
    apiFetch<ApiResponse<ChecklistInstance[]> & { meta: ChecklistInstancePage }>(
      `/checklist-instances${buildQuery({ definitionId, ...paging })}`,
    ).then(r => ({ ...r, data: normalizeInstances(r.data) })),

  list: (filter: { storeId?: string; assigneeId?: string; status?: ChecklistInstanceStatus; from?: string; to?: string; includeDeleted?: boolean } & PageParams = {}) =>
    apiFetch<ApiResponse<ChecklistInstance[]> & { meta: ChecklistInstancePage }>(
      `/checklist-instances${buildQuery({
        ...filter,
        from: filter.from ? toDayParam(filter.from) : undefined,
        to: filter.to ? toDayParam(filter.to) : undefined,
      })}`,
    ).then(r => ({ ...r, data: normalizeInstances(r.data) })),

  getPendingVerification: (paging: PageParams = {}) =>
    apiFetch<ApiResponse<ChecklistInstance[]> & { meta: ChecklistInstancePage }>(
      `/checklist-instances/pending-verification${buildQuery(paging)}`,
    ).then(r => ({ ...r, data: normalizeInstances(r.data) })),

  setItemDone: (itemId: string, isDone: boolean, values?: {
    numericValue?: number;
    booleanAnswer?: 'YES' | 'NO';
    textValue?: string;
    dateValue?: string;
    gpsLat?: number;
    gpsLng?: number;
    gpsAccuracy?: number;
    signatureValue?: string;
    secondSignatureValue?: string;
    conditionalReasonValue?: string;
    remarks?: string | null;
    notApplicable?: boolean;
  }) =>
    apiFetch<ApiResponse<ChecklistInstanceItem>>(`/checklist-instance-items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isDone, ...values }),
    }),

  verify: (id: string, payload: VerifyChecklistInstancePayload) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/verify`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).then(r => ({ ...r, data: normalizeInstance(r.data) })),

  submit: (id: string) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/submit`, { method: 'PATCH' })
      .then(r => ({ ...r, data: normalizeInstance(r.data) })),

  waiveItem: (id: string, itemId: string, reason: string) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/items/${itemId}/waive`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }).then(r => ({ ...r, data: normalizeInstance(r.data) })),

  unwaiveItem: (id: string, itemId: string) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/items/${itemId}/waive`, { method: 'DELETE' })
      .then(r => ({ ...r, data: normalizeInstance(r.data) })),

  raiseTicket: (id: string, itemId: string, payload: { note: string; tatHours: number; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/items/${itemId}/raise-ticket`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(r => ({ ...r, data: normalizeInstance(r.data) })),

  sendBack: (id: string, payload: SendBackChecklistInstancePayload) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/send-back`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).then(r => ({ ...r, data: normalizeInstance(r.data) })),

  reopenApproval: (id: string) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/reopen-approval`, { method: 'PATCH' })
      .then(r => ({ ...r, data: normalizeInstance(r.data) })),

  uploadImages: async (itemId: string, files: File[], captureMethod: CaptureMethod, purpose: ChecklistImagePurpose = 'GENERAL') => {
    const formData = new FormData();
    (await shrinkImages(files)).forEach(f => formData.append('images', f));
    formData.append('captureMethod', captureMethod);
    formData.append('purpose', purpose);
    return apiFetch<ApiResponse<ChecklistInstanceImage[]>>(`/checklist-instance-items/${itemId}/images`, {
      method: 'POST',
      body: formData,
    });
  },

  deleteImage: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/checklist-instance-images/${id}`, { method: 'DELETE' }),

  getComplianceReport: (groupBy: ComplianceReportGroupBy = 'month', storeId?: string, from?: string, to?: string, includeDeleted?: boolean, assigneeId?: string) => {
    const params = new URLSearchParams({ groupBy });
    if (storeId) params.set('storeId', storeId);
    if (from) params.set('from', toDayParam(from));
    if (to) params.set('to', toDayParam(to));
    if (includeDeleted) params.set('includeDeleted', '1');
    if (assigneeId) params.set('assigneeId', assigneeId);
    return apiFetch<ApiResponse<ComplianceReportRow[]>>(`/checklist-instances/reports/compliance?${params.toString()}`);
  },

  getComplianceByStore: (from?: string, to?: string) =>
    apiFetch<ApiResponse<ChecklistStoreComplianceRow[]>>(
      `/checklist-instances/reports/by-store${buildQuery({ from: from ? toDayParam(from) : undefined, to: to ? toDayParam(to) : undefined })}`,
    ),

  getScoreRuns: (from: string, to: string, storeId?: string, departmentId?: string) =>
    apiFetch<ApiResponse<{ runs: ChecklistScoreRun[]; total: number | null }>>(
      `/checklist-instances/reports/score-runs${buildQuery({ from: toDayParam(from), to: toDayParam(to), storeId, departmentId })}`,
    ),

  getDepartmentMonthly: (from: string, to: string) =>
    apiFetch<ApiResponse<ChecklistDepartmentMonthlyRow[]>>(
      `/checklist-instances/reports/department-monthly${buildQuery({ from: toDayParam(from), to: toDayParam(to) })}`,
    ),

  getStoreDaily: (from: string, to: string) =>
    apiFetch<ApiResponse<ChecklistStoreDailyRow[]>>(
      `/checklist-instances/reports/store-daily${buildQuery({ from: toDayParam(from), to: toDayParam(to) })}`,
    ),
};

export type ChecklistItemHistoryEvent = {
  id: string;
  itemId: string;
  at: string;
  actorName: string;
  source: string | null;
  summary: string;
};

export const checklistItemHistoryApi = {
  get: (instanceId: string) =>
    apiFetch<ApiResponse<ChecklistItemHistoryEvent[]>>(`/checklist-instances/${instanceId}/item-history`),
};
