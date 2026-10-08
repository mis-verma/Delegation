import { z } from 'zod';
import { apiFetch, type PendingApprovalPreview } from './http';
import { arrayField, withArrayDefaults, normalizeWith } from './normalize';
import type { ApiResponse, ChecklistRecurrence, ChecklistItemType, ChecklistConditionalAction } from './checklistDefinitions';
import type { CaptureMethod } from './ticket';

// OVERDUE is a subset of OPEN (unfinished and past its period end), matching the server's
// InstanceStatusFilter — it used to be applied client-side over the whole list.
// 'OPEN' is every incomplete instance (overdue included) — the broad "Pending" bucket. 'DUE' is
// the on-track subset: incomplete but not yet past its period end.
export type ChecklistInstanceStatus = 'OPEN' | 'DUE' | 'COMPLETED' | 'OVERDUE';
export type ChecklistVerificationStatus = 'NOT_SUBMITTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type ChecklistInstanceImage = {
  id:                      string;
  url:                     string;
  originalFilename:        string | null;
  mimeType:                string;
  sizeBytes:               number;
  captureMethod:           CaptureMethod;
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

// userId is always populated server-side (see checklistInstance.service.ts's populateInstance) so
// the UI can show the auditor's name and store without a separate lookup.
export type ChecklistInstanceItemSubmissionUser = {
  id:        string;
  firstName: string;
  lastName:  string | null;
  storeId:   string | null;
  /** false once the person has left (deactivated): their name is shown with "(left)". */
  isActive?: boolean;
  gender?:   'FEMALE' | 'MALE' | null;
};

/** A dress type the checker can pick for one person on one AUDIT question. */
export type ChecklistAuditDressTypeOption = { id: string; name: string; gender: 'FEMALE' | 'MALE' | null };

export type ChecklistInstanceItemSubmission = {
  id:          string;
  itemId:      string;
  userId:      ChecklistInstanceItemSubmissionUser;
  accessories: ChecklistInstanceItemSubmissionAccessory[];
  remarks:     string | null;
  isDone:      boolean;
  /** This person couldn't be checked (absent, on leave): counts as submitted, reason in `remarks`. */
  isNotApplicable: boolean;
  completedAt: string | null;
  images:      ChecklistInstanceItemSubmissionImage[];
  /** What this person is wearing for this audit (their own pick, defaulting to their profile). Null = the usual list. */
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
  /** Name of whoever ticked this question, so a reviewer can see who did it. */
  completedByName:    string | null;
  requiredImageCount: number;
  maxImageCount:      number | null;
  requiresLivePhoto:  boolean;
  /** Critical question: a bad answer counts double in compliance and is flagged to the reviewer. */
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
  // Two independent action sets — one per possible Yes/No answer — mirroring
  // ChecklistDefinitionItem's model. See checklistInstanceArrayDefaults below for null->[] defaults.
  yesActions:         ChecklistConditionalAction[];
  noActions:          ChecklistConditionalAction[];
  /** "Good answer" rule for the compliance %; null = this question isn't scored. */
  acceptableAnswers:  string[] | null;
  acceptableMin:      number | null;
  acceptableMax:      number | null;
  conditionalReasonValue: string | null;
  remarks:            string | null;
  /** Marked "Not applicable": counts as done, reason is in `remarks`. */
  isNotApplicable:    boolean;
  /** Why a reviewer sent this question back; cleared once it's completed again. */
  sendBackNote:       string | null;
  /** How many times a reviewer sent this question back. Counts as a failed compliance check. */
  sendBackCount:      number;
  /** A reviewer excused this question, so it no longer counts against compliance. */
  waivedAt:           string | null;
  waivedBy:           string | null;
  waiveReason:        string | null;
  issueId:            string | null;
  instanceId:         string;
  images:             ChecklistInstanceImage[];
  submissions:        ChecklistInstanceItemSubmission[];
  /** AUDIT items: dress types that have their own list on this question. Empty/absent = no selector. */
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
  assigneeIds:      string[];
  // Additive on top of the role-based verify rule (ADMIN/PC always, MANAGER/HOD own department
  // only) — copied from the definition's reviewerIds at generation time.
  reviewerIds:      string[];
  periodKey:        string;
  periodStart:      string;
  periodEnd:        string;
  generatedAt:      string;
  verificationStatus: ChecklistVerificationStatus;
  /** When the person filling it in pressed Submit (and who). Null until then. */
  submittedAt:        string | null;
  submittedBy:        string | null;
  submittedByName:    string | null;
  /** Nobody finished it before its day ended: counted as missed and no longer fillable by its assignees. */
  isMissed?:          boolean;
  verifiedBy:         string | null;
  verifiedAt:         string | null;
  verificationNote:   string | null;
  items:            ChecklistInstanceItem[];
};

export type SendBackChecklistInstancePayload = { itemIds: string[]; note: string };
export type VerifyChecklistInstancePayload = { action: 'APPROVE' | 'REJECT'; note?: string };

// 'none' returns one bucket named 'range' covering the whole from/to window.
export type ComplianceReportGroupBy = 'day' | 'week' | 'month' | 'year' | 'none';

// Same shape as task.ts's ComplianceReportRow — the recurring-checklist sibling report, bucketed
// by each instance's periodStart rather than item createdAt (see checklistInstance.service.ts).
export type ComplianceReportRow = {
  bucket: string;
  totalItems: number;
  doneItems: number;
  completionRate: number | null;
  itemsRequiringPhotos: number;
  qualityRate: number | null;
  // Share of gated Yes/No-style items (one branch configured with REQUIRE_PHOTO/ASK_REASON/
  // CREATE_ISSUE/NOTIFY_AREA_MANAGER) whose actual answer landed on that flagged branch. Higher
  // is worse — pair with a `lowerIsBetter` treatment wherever this is shown, same as Overdue.
  // Stays flagged even once a required photo/reason was supplied to get past it; null when
  // nothing in this bucket was actually gated with a conditional action.
  gatedBooleanItems: number;
  issueRate: number | null;
  // First-attempt-approval quality: of the instances actually submitted (reached PENDING/
  // APPROVED/REJECTED), what % were approved without ever having been rejected first. A reject
  // permanently disqualifies that instance from "first attempt," even once it's later fixed
  // and approved — mirrors qualityRate's per-item strictness at the instance level.
  submittedInstances: number;
  firstAttemptApproved: number;
  approvalRate: number | null;
  /** Answers inside their acceptable-answer rule / answers checked; null when nothing is scored. */
  complianceRate: number | null;
  /** How many answers carry an acceptable-answer rule and were checked. */
  scoredAnswers: number;
  /** Runs whose deadline has passed (or that are fully done): the only runs completion counts. */
  dueRuns: number;
  /** Runs not yet due and still open. Optional until every server build returns it. */
  pendingRuns?: number;
};

/** One store on one day (GET /checklist-instances/reports/store-daily). Days with no due runs are absent. */
export type ChecklistStoreDailyRow = {
  storeId: string;
  storeName: string;
  /** 'YYYY-MM-DD', the org's own calendar day. */
  day: string;
  completionRate: number | null;
  doneItems: number;
  totalItems: number;
  dueRuns: number;
};

/** One department in one month (GET /checklist-instances/reports/department-monthly). */
export type ChecklistDepartmentMonthlyRow = {
  departmentId: string;
  departmentName: string;
  /** 'YYYY-MM' */
  month: string;
  completionRate: number | null;
  complianceRate: number | null;
  doneItems: number;
  totalItems: number;
  /** Raw weights behind complianceRate, so months can be totalled without averaging percentages. */
  weightedGood: number;
  weightedScored: number;
  dueRuns: number;
};

/** One row of the per-store comparison (GET /checklist-instances/reports/by-store). */
export type ChecklistStoreComplianceRow = {
  storeId: string;
  storeName: string;
  completionRate: number | null;
  qualityRate: number | null;
  approvalRate: number | null;
  complianceRate: number | null;
  dueRuns: number;
  items: number;
};

// Accepts numbers too, since page/limit are numeric — they were being stringified at the call
// site before, which is easy to forget and silently drops the param.
const buildQuery = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

// The checklist report endpoints filter on calendar days (a run's periodStart is a day label), so
// they want plain 'YYYY-MM-DD', not an instant. A caller holding a local-midnight ISO string (the
// picked day) gets back the same local day it picked; an already-plain date passes through.
const toDayParam = (value: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// assigneeIds/items are the fields this feature's own crash risk hinges on — TicketCard-style
// consumers (getChecklistProgress, instanceProgressStatus) iterate `.items` and the dashboard's
// Compliance card filters on `.assigneeIds`, both assuming an array that the type declares but a
// real response isn't guaranteed to include.
const checklistInstanceArrayDefaults = withArrayDefaults({
  assigneeIds: arrayField(z.string()),
  reviewerIds: arrayField(z.string()),
  items: arrayField(z.unknown()),
});
const normalizeInstance = (raw: unknown) => normalizeWith<ChecklistInstance>(checklistInstanceArrayDefaults, raw);
const normalizeInstances = (raw: unknown[]) => raw.map(normalizeInstance);

/**
 * The three list endpoints now answer `{ success, data, meta }`. `page`/`limit` are optional and
 * the query stays unbounded when neither is sent, so `data` is unchanged for callers that don't
 * ask to paginate — `meta.total` is then simply the full count.
 */
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
  /** On-track subset of `pending` — incomplete but not yet past its period end. */
  due: number;
  overdue: number;
  /** Across every item of every matching instance — powers completion-ratio gauges. */
  totalItems: number;
  doneItems: number;
  /** Generated today — powers the sidebar's per-entity badge breakdown. */
  newToday: number;
};

/** One submitted audit row for the History page: what an auditor recorded about ONE person on one
 *  AUDIT item of one run. ADMIN/PC get every store, MANAGER/SENIOR only their own department. */
/** Someone who has been deactivated, with what their checklist history looks like. */
export type FormerPerson = {
  id:             string;
  firstName:      string;
  lastName:       string | null;
  role:           string;
  departmentName: string | null;
  storeName:      string | null;
  /** When their account was deactivated. */
  leftAt:         string;
  runsAssigned:   number;
  runsWorked:     number;
  auditsOnThem:   number;
};

/** The light shape of a former person, for name lookups and pickers. */
export type FormerPersonName = {
  id:        string;
  firstName: string;
  lastName:  string | null;
  email:     string;
};

/** One checklist run a person was part of. `theirs` = questions they completed themselves. */
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
  /** The person couldn't be checked that day; `remarks` holds the reason. */
  isNotApplicable: boolean;
  storeId:         string;
  storeName:       string | null;
  personFirstName: string;
  personLastName:  string | null;
  personIsActive:  boolean;
  accessories:    ChecklistInstanceItemSubmissionAccessory[];
  images:         Pick<ChecklistInstanceItemSubmissionImage, 'id' | 'url' | 'originalFilename' | 'captureMethod' | 'createdAt'>[];
};

/** Dashboard's "Needs your approval" card — one row per checklist run currently awaiting an
 *  ADMIN/PC's sign-off. No single submitter field here (assignment is many-to-many), so this
 *  carries the store instead — see the server-side ChecklistPendingApprovalRow doc comment. */
export type ChecklistPendingApproval = {
  id: string;
  title: string;
  storeName: string | null;
  waitingSince: string;
};

export type WeeklyCellState = 'done' | 'late' | 'missed' | 'open' | 'holiday' | 'off' | 'upcoming' | 'summary';
/** `compliance` is answer quality (weighted, critical x2, sent back = fail); null when nothing was checked. */
export type WeeklyCell = {
  /** A day (YYYY-MM-DD) for a day column, a month (YYYY-MM) for a month column. */
  date: string;
  state: WeeklyCellState;
  runId: string | null;
  done: number;
  total: number;
  compliance: number | null;
  /** Month columns only: that month's runs added up. */
  due?: number;
  onTime?: number;
  late?: number;
  missed?: number;
  rate?: number | null;
  completion?: number | null;
};
export type WeeklyReport = {
  from: string;
  to: string;
  weekStart: string;
  /** One column per day up to 31 days, one per month beyond that. */
  kind: 'day' | 'month';
  columns: { key: string; label: string }[];
  days: string[];
  holidays: Record<string, string>;
  rows: { definitionId: string; scopeKey: string; name: string; storeId: string; storeName: string; cells: WeeklyCell[]; rate: number | null; completion: number | null; compliance: number | null }[];
  summary: { due: number; onTime: number; late: number; missed: number; rate: number | null; completion: number | null; compliance: number | null };
};

export const checklistInstanceApi = {
  getMine: (
    filter: {
      status?: ChecklistInstanceStatus; storeId?: string; recurrence?: ChecklistRecurrence; verificationStatus?: ChecklistVerificationStatus; departmentId?: string; assigneeIds?: string[];
      /** Restricts to instances whose period falls in [from, to] — ISO strings, same convention as getSummary. */
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

  /** Just id + name for every former person: a light call for name lookups (no per-person aggregates). */
  getFormerPeopleNames: () =>
    apiFetch<ApiResponse<FormerPersonName[]>>('/checklist-instances/former-people/names').then(r => r.data),

  getPersonRuns: (userId: string, paging: PageParams = {}) =>
    apiFetch<ApiResponse<PersonRun[]> & { meta: ChecklistInstancePage }>(
      `/checklist-instances/former-people/${userId}/runs${buildQuery({ ...paging })}`,
    ),

  getAuditHistory: (filter: { storeId?: string; personId?: string; from?: string; to?: string } = {}, paging: PageParams = {}) =>
    apiFetch<ApiResponse<AuditHistoryRow[]> & { meta: ChecklistInstancePage }>(
      `/checklist-instances/audit-history${buildQuery({ ...filter, ...paging })}`,
    ),

  /**
   * The counts screens used to derive by downloading every instance and reducing in JS. Ask for
   * these instead of `.length`-ing a list — that pattern is why the list endpoints could not
   * paginate.
   */
  getSummary: (filter: {
    mine?: boolean;
    storeId?: string;
    assigneeId?: string;
    /** "Also shared with any of these people" — independent of `assigneeId` above. */
    assigneeIds?: string[];
    definitionId?: string;
    recurrence?: ChecklistRecurrence;
    verificationStatus?: ChecklistVerificationStatus;
    departmentId?: string;
    /** Restricts to instances whose period falls in [from, to]. ISO strings or plain YYYY-MM-DD; always sent as plain days. */
    from?: string;
    to?: string;
    /** ADMIN/PC only, opt-in — includes instances whose checklist has since been deleted (kept
     *  for audit history, hidden by default so a delete actually cleans up this board). */
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

  /** Weekly fill report: one row per daily checklist per store, one cell per weekday. `weekStart` is the Monday. */
  /** Fill report over any window of up to a year, as day columns or month columns. */
  getPeriodReport: (from: string, to: string, storeId?: string, departmentId?: string) =>
    apiFetch<ApiResponse<WeeklyReport>>(`/checklist-instances/reports/period${buildQuery({ from, to, storeId, departmentId })}`),
  getWeeklyReport: (weekStart: string, storeId?: string, departmentId?: string) =>
    apiFetch<ApiResponse<WeeklyReport>>(`/checklist-instances/reports/weekly${buildQuery({ weekStart, storeId, departmentId })}`),

  getForDefinition: (definitionId: string, paging: PageParams = {}) =>
    apiFetch<ApiResponse<ChecklistInstance[]> & { meta: ChecklistInstancePage }>(
      `/checklist-instances${buildQuery({ definitionId, ...paging })}`,
    ).then(r => ({ ...r, data: normalizeInstances(r.data) })),

  // Powers the compliance board — same endpoint as getForDefinition, generalized to whichever
  // combination of filters the admin has picked (store and/or person, plus status).
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
    /** null clears the remark. */
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

  /** Department head, PC or Admin: excuse a question that counts against compliance, with a reason. */
  waiveItem: (id: string, itemId: string, reason: string) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/items/${itemId}/waive`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }).then(r => ({ ...r, data: normalizeInstance(r.data) })),

  unwaiveItem: (id: string, itemId: string) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/items/${itemId}/waive`, { method: 'DELETE' })
      .then(r => ({ ...r, data: normalizeInstance(r.data) })),

  sendBack: (id: string, payload: SendBackChecklistInstancePayload) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/send-back`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).then(r => ({ ...r, data: normalizeInstance(r.data) })),

  /** ADMIN only: puts an APPROVED run back into the review queue (PENDING_APPROVAL). */
  reopenApproval: (id: string) =>
    apiFetch<ApiResponse<ChecklistInstance>>(`/checklist-instances/${id}/reopen-approval`, { method: 'PATCH' })
      .then(r => ({ ...r, data: normalizeInstance(r.data) })),

  uploadImages: (itemId: string, files: File[], captureMethod: CaptureMethod) => {
    const formData = new FormData();
    files.forEach(f => formData.append('images', f));
    formData.append('captureMethod', captureMethod);
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

  /** One grouped query for every store: ADMIN/PC see all active stores, MANAGER/SENIOR their own scope. */
  getComplianceByStore: (from?: string, to?: string) =>
    apiFetch<ApiResponse<ChecklistStoreComplianceRow[]>>(
      `/checklist-instances/reports/by-store${buildQuery({ from: from ? toDayParam(from) : undefined, to: to ? toDayParam(to) : undefined })}`,
    ),

  /** Completion and compliance per department per month. */
  getDepartmentMonthly: (from: string, to: string) =>
    apiFetch<ApiResponse<ChecklistDepartmentMonthlyRow[]>>(
      `/checklist-instances/reports/department-monthly${buildQuery({ from: toDayParam(from), to: toDayParam(to) })}`,
    ),

  /** Completion for every store on every day of the range, for the store-by-day grid. */
  getStoreDaily: (from: string, to: string) =>
    apiFetch<ApiResponse<ChecklistStoreDailyRow[]>>(
      `/checklist-instances/reports/store-daily${buildQuery({ from: toDayParam(from), to: toDayParam(to) })}`,
    ),
};

/** One saved change to a question: who, when, and a readable line of what changed. Reviewers only. */
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
