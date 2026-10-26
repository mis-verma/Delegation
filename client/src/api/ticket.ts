import { shrinkImages } from '../lib/compressImage';
import { apiFetch, apiUpload, type SummaryScope, type PendingApprovalPreview } from './http';
import { enqueueUpload } from '../lib/uploadQueue';
import { arrayField, withArrayDefaults, normalizeWith, n } from './normalize';
import type { Tag } from './tags';

export type Priority       = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AssignmentMode = 'AUTO' | 'MANUAL';
export type TicketStatus   = 'OPEN' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'CLOSED' | 'ON_HOLD';

export type TatReportGroupBy = "day" | "week" | "month" | "year" | "none"

export type TicketSlaFilter = 'overdue_open' | 'closed_late' | 'closed_on_time' | 'not_done';

export type TatReportRow = {
  bucket : string;
  createdCount : number;
  closedCount : number;
  avgTatHours : number | null;
  overdueCount : number;
  closedLateCount : number;
  closedWithTatCount? : number;
  completionRate : number | null;
  closedVsCreatedPct? : number | null;
}

export type OwnerStatsScope = 'department' | 'store' | 'user' | 'org';

export type OwnerStatsRow = {
  ownerId : string | null;
  total : number;
  closed : number;
  overdueCount : number;
  avgTatHours : number | null;
  createdCount? : number;
  createdAndClosedCount? : number;
}

export type CaptureMethod = 'LIVE' | 'GALLERY';

export const RESTRICTED_STATUSES = ['IN_PROGRESS', 'ON_HOLD', 'PENDING_APPROVAL'] as const;
export type RestrictedStatus = typeof RESTRICTED_STATUSES[number];

export type ChecklistImage = {
  id:               string;
  url:              string;
  originalFilename: string | null;
  mimeType:         string;
  sizeBytes:        number;
  captureMethod:    CaptureMethod;
  checklistItemId:  string;
  uploadedBy:       string;
  createdAt:        string;
};

export type ChecklistItem = {
  id:                 string;
  label:              string;
  isDone:             boolean;
  assigneeId:         string | null;
  dueAt:              string | null;
  completedAt:        string | null;
  checklistId:        string;
  requiredImageCount: number;
  maxImageCount:      number | null;
  requiresLivePhoto:  boolean;
  remarks:            string | null;
  images:             ChecklistImage[];
};

export type Checklist = {
  id:       string;
  title:    string;
  ticketId: string;
  items:    ChecklistItem[];
};

export type TicketStatusUpdate = {
  id:         string;
  ticketId:   string;
  fromStatus: TicketStatus;
  toStatus:   RestrictedStatus;
  remark:     string;
  changedBy:  string | null;
  changedByUser: { id: string; email: string; firstName: string; role: string } | null;
  photos:     TicketAttachment[];
  createdAt:  string;
};

export type TicketComment = {
  id:        string;
  body:      string;
  ticketId:  string;
  authorId:  string;
  author:    { id: string; email: string; firstName: string; role: string } | null;
  createdAt: string;
};

export type TicketAttachment = {
  id:               string;
  url:              string;
  originalFilename: string | null;
  mimeType:         string;
  sizeBytes:        number;
  captureMethod:    CaptureMethod;
  ticketId:         string;
  statusUpdateId?:  string | null;
  uploadedBy:       { id: string; email: string; firstName: string; role: string } | null;
  createdAt:        string;
};

export type Ticket = {
  id:             string;
  title:          string;
  description:    string;
  status:         TicketStatus;
  priority:       Priority;
  assignmentMode: AssignmentMode;
  tatHours:       number | null;
  tatDueAt:       string | null;
  startDate:      string | null;
  userId:         string;
  assigneeId:     string | null;
  storeId:        string | null;
  categoryId:     string | null;
  departmentId:   string | null;
  createdAt:      string;
  updatedAt:      string;
  closedAt:       string | null;
  submittedAt?: string | null;
  reopenCount?: number;
  declinedAt?: string | null;
  declinedBy?: string | null;
  declineReason?: string | null;
  decliner?: { id: string; email: string; firstName: string; lastName?: string | null; role: string } | null;
  raisedBy?: { id: string; email: string; firstName: string; lastName?: string | null; role: string } | null;
  assignee:      { id: string; email: string; firstName: string; role: string } | null;
  checklists:     Checklist[];
  attachments:    TicketAttachment[];
  comments:       TicketComment[];
  statusUpdates:  TicketStatusUpdate[];
  tags:           Tag[];
  isOverdue:      boolean;
  verifiedBy:       string | null;
  verifiedAt:       string | null;
  verificationNote: string | null;
  verifier:         { id: string; email: string; firstName: string; role: string } | null;
  awaitingHeadApproval?: boolean;
  assignmentApprovedAt?: string | null;
  assignmentApprovedBy?: string | null;
  assignmentApprover?: { id: string; email: string; firstName: string; lastName?: string | null; role: string } | null;
  approvalStage?:   'HOD' | 'PC' | null;
  hodApprovedBy?:   string | null;
  hodApprovedAt?:   string | null;
  hodApprover?:     { id: string; email: string; firstName: string; lastName?: string | null; role: string } | null;
  reviewers:        { id: string; firstName: string; lastName: string | null; email: string }[];
};

export type PaginatedResponse<T> = {
  success: boolean;
  data:    T[];
  meta:    { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; counts?: TicketListCounts };
};

export type TicketListCounts = { scope: number; pending: number; completed: number; due: number; delayed: number };

export type TicketListQuery = {
  page: number;
  limit: number;
  sort?: "tatDueAt" | "priority" | "createdAt" | "title";
  bucket?: "pending" | "completed" | "due" | "delayed";
  handledBy?: "assignee" | "creator";
  status?: TicketStatus;
  priority?: Priority[];
  departmentId?: string;
  assigneeIds?: string[];
  raisedByIds?: string[];
  labelIds?: string[];
  search?: string;
  personId?: string;
  drillDepartmentId?: string;
  drillStoreId?: string;
  createdFrom?: number;
  createdTo?: number;
  dueFrom?: number;
  dueTo?: number;
  sla?: TicketSlaFilter;
};

const ticketListParams = (query: TicketListQuery) => {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  const set = (key: string, value: string | undefined) => { if (value) params.set(key, value); };
  const iso = (at: number | undefined) => (at === undefined ? undefined : new Date(at).toISOString());
  set("sort", query.sort);
  set("bucket", query.bucket);
  set("handledBy", query.handledBy);
  set("filterStatus", query.status);
  set("priority", query.priority?.join(","));
  set("filterDepartmentId", query.departmentId);
  set("assigneeIds", query.assigneeIds?.join(","));
  set("raisedByIds", query.raisedByIds?.join(","));
  set("labelIds", query.labelIds?.join(","));
  set("q", query.search);
  set("assigneeId", query.personId);
  set("departmentId", query.drillDepartmentId);
  set("storeId", query.drillStoreId);
  set("createdFrom", iso(query.createdFrom));
  set("createdTo", iso(query.createdTo));
  set("dueFrom", iso(query.dueFrom));
  set("dueTo", iso(query.dueTo));
  set("sla", query.sla);
  return params;
};

export type ApiResponse<T> = {
  success: boolean;
  data:    T;
};

export type CreateTicketPayload = {
  title:           string;
  description:     string;
  priority?:       Priority;
  assignmentMode?: AssignmentMode;
  assigneeId?:     string;
  storeId?:        string;
  categoryId?:     string;
  departmentId?:   string;
  tatHours?:       number;
  startDate?:      string;
  tagIds?:         string[];
  reviewerIds?:    string[];
};

export type UpdateTicketPayload = Partial<Omit<CreateTicketPayload, 'assigneeId' | 'startDate'> & { status: TicketStatus; assigneeId: string | null; startDate: string | null; expectedUpdatedAt: string }>;

export type VerifyTicketPayload = { action: 'APPROVE' | 'REJECT'; note?: string };

export type TicketSummary = {
  total:     number;
  newToday:  number;
  pending:   number;
  due:       number;
  overdue:   number;
  completed: number;
};

export type TicketPendingApproval = {
  id: string;
  title: string;
  submittedBy: string | null;
  waitingSince: string;
};

export type CreateChecklistItemPayload = {
  label:               string;
  assigneeId?:         string;
  dueAt?:              string;
  requiredImageCount?: number;
  maxImageCount?:      number;
  requiresLivePhoto?:  boolean;
  remarks?:            string;
};

export type CreateChecklistPayload = {
  title:  string;
  items?: CreateChecklistItemPayload[];
};

export type UpdateChecklistItemPayload = {
  label?:              string;
  assigneeId?:         string | null;
  dueAt?:              string | null;
  requiredImageCount?: number;
  maxImageCount?:      number | null;
  requiresLivePhoto?:  boolean;
  isDone?:             false;
};

const ticketArrayDefaults = withArrayDefaults({
  comments: arrayField(n.unknown()),
  attachments: arrayField(n.unknown()),
  checklists: arrayField(n.unknown()),
  statusUpdates: arrayField(n.unknown()),
  tags: arrayField(n.unknown()),
  reviewers: arrayField(n.unknown()),
});
const normalizeTicket = (raw: unknown) => normalizeWith<Ticket>(ticketArrayDefaults, raw);

export const ticketApi = {
  getAll: (page = 1, limit = 20, status?: TicketStatus, assigneeId?: string, overdue?: boolean, from?: string, to?: string, dateField?: 'createdAt' | 'closedAt', sla?: TicketSlaFilter) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    if (assigneeId) params.set('assigneeId', assigneeId);
    if (overdue !== undefined) params.set('overdue', String(overdue));
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (dateField) params.set('dateField', dateField);
    if (sla) params.set('sla', sla);
    return apiFetch<PaginatedResponse<Ticket>>(`/tickets?${params.toString()}`)
      .then(r => ({ ...r, data: r.data.map(normalizeTicket) }));
  },

  getPage: (query: TicketListQuery) =>
    apiFetch<PaginatedResponse<Ticket>>(`/tickets?${ticketListParams(query).toString()}`)
      .then(r => ({ ...r, data: r.data.map(normalizeTicket) })),

  getOne: (id: string) =>
    apiFetch<ApiResponse<Ticket>>(`/tickets/${id}`).then(r => ({ ...r, data: normalizeTicket(r.data) })),

  getSummary: (scope: SummaryScope = 'mine'): Promise<TicketSummary> =>
    apiFetch<ApiResponse<TicketSummary>>(`/tickets/summary?scope=${scope}`).then(r => r.data),

  getPendingApproval: (): Promise<PendingApprovalPreview<TicketPendingApproval>> =>
    apiFetch<ApiResponse<TicketPendingApproval[]> & { meta?: { total: number } }>('/tickets/pending-approval')
      .then(r => ({ rows: r.data, total: r.meta?.total ?? r.data.length })),

  create: (payload: CreateTicketPayload) =>
    apiFetch<ApiResponse<Ticket>>('/tickets', { method: 'POST', body: JSON.stringify(payload) }).then(r => ({ ...r, data: normalizeTicket(r.data) })),

  update: (id: string, payload: UpdateTicketPayload) =>
    apiFetch<ApiResponse<Ticket>>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then(r => ({ ...r, data: normalizeTicket(r.data) })),

  reopenDeclined: (id: string) =>
    apiFetch<ApiResponse<Ticket>>(`/tickets/${id}/reopen-declined`, { method: 'POST' }).then(r => ({ ...r, data: normalizeTicket(r.data) })),

  approveAssignment: (id: string) =>
    apiFetch<ApiResponse<Ticket>>(`/tickets/${id}/approve-assignment`, { method: 'POST' }).then(r => ({ ...r, data: normalizeTicket(r.data) })),

  decline: (id: string, reason: string) =>
    apiFetch<ApiResponse<Ticket>>(`/tickets/${id}/decline`, { method: 'POST', body: JSON.stringify({ reason }) }).then(r => ({ ...r, data: normalizeTicket(r.data) })),

  verify: (id: string, payload: VerifyTicketPayload) =>
    apiFetch<ApiResponse<Ticket>>(`/tickets/${id}/verify`, { method: 'PATCH', body: JSON.stringify(payload) }).then(r => ({ ...r, data: normalizeTicket(r.data) })),

  addStatusUpdate: async (id: string, payload: { status: RestrictedStatus; remark?: string; captureMethod?: CaptureMethod; files?: File[] }) => {
    const formData = new FormData();
    formData.append('status', payload.status);
    if (payload.remark) formData.append('remark', payload.remark);
    if (payload.captureMethod) formData.append('captureMethod', payload.captureMethod);
    (await shrinkImages(payload.files ?? [])).forEach(f => formData.append('images', f));
    return apiFetch<ApiResponse<Ticket>>(`/tickets/${id}/status-updates`, { method: 'POST', body: formData })
      .then(r => ({ ...r, data: normalizeTicket(r.data) }));
  },

  delete: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/tickets/${id}`, { method: 'DELETE' }),

  addChecklist: (ticketId: string, payload: CreateChecklistPayload) =>
    apiFetch<ApiResponse<Checklist>>(`/tickets/${ticketId}/checklists`, { method: 'POST', body: JSON.stringify(payload) }),

  deleteChecklist: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/checklists/${id}`, { method: 'DELETE' }),

  updateChecklistItem: (id: string, payload: UpdateChecklistItemPayload) =>
    apiFetch<ApiResponse<ChecklistItem>>(`/checklist-items/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  updateChecklistItemRemarks: (id: string, remarks: string) =>
    apiFetch<ApiResponse<ChecklistItem>>(`/checklist-items/${id}/remarks`, {
      method: 'PATCH',
      body:   JSON.stringify({ remarks }),
    }),

  completeChecklistItem: (id: string) =>
    apiFetch<ApiResponse<ChecklistItem>>(`/checklist-items/${id}/complete`, { method: 'POST' }),

  deleteChecklistItem: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/checklist-items/${id}`, { method: 'DELETE' }),

  uploadChecklistImages: async (itemId: string, files: File[], captureMethod: CaptureMethod) => {
    const formData = new FormData();
    (await shrinkImages(files)).forEach(f => formData.append('images', f));
    formData.append('captureMethod', captureMethod);
    return apiFetch<ApiResponse<ChecklistImage[]>>(`/checklist-items/${itemId}/images`, {
      method: 'POST',
      body:   formData,
    });
  },

  deleteChecklistImage: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/checklist-images/${id}`, { method: 'DELETE' }),

  uploadAttachments: async (ticketId: string, files: File[]) => {
    const formData = new FormData();
    (await shrinkImages(files)).forEach(f => formData.append('images', f));
    return enqueueUpload(() => apiUpload<ApiResponse<TicketAttachment[]>>(`/tickets/${ticketId}/attachments`, formData));
  },

  deleteAttachment: (id: string) =>
    apiFetch<ApiResponse<{ deleted: boolean }>>(`/ticket-attachments/${id}`, { method: 'DELETE' }),

  addComment: (ticketId: string, body: string) =>
    apiFetch<ApiResponse<TicketComment>>(`/tickets/${ticketId}/comments`, {
      method: 'POST',
      body:   JSON.stringify({ body }),
    }),

  getTatReport : ( groupBy : TatReportGroupBy = "day", from?: string, to?: string, departmentId?: string, storeId?: string) => {
    const params = new URLSearchParams({ groupBy });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (departmentId) params.set('departmentId', departmentId);
    if (storeId) params.set('storeId', storeId);
    return apiFetch<ApiResponse<TatReportRow[]>>(`/tickets/reports/tat?${params.toString()}`);
  },

  getOwnerStats : (scope : OwnerStatsScope, from?: string, to?: string, departmentId?: string, storeId?: string) => {
    const params = new URLSearchParams({ scope });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (departmentId) params.set('departmentId', departmentId);
    if (storeId) params.set('storeId', storeId);
    return apiFetch<ApiResponse<OwnerStatsRow[]>>(`/tickets/reports/by-owner?${params.toString()}`);
  },
};
