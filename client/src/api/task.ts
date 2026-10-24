import { shrinkImages } from '../lib/compressImage';
import { apiFetch, type SummaryScope, type PendingApprovalPreview } from './http';
import { arrayField, withArrayDefaults, normalizeWith, n } from './normalize';
import { taskChecklistDefaults, type TaskChecklist } from './taskChecklist';
import type { Tag } from './tags';

export type TaskAttachment = {
    id:               string;
    url:              string;
    originalFilename: string | null;
    mimeType:         string;
    sizeBytes:        number;
    taskId:           string;
    uploadedBy:       { id: string; email: string; firstName: string; role: string } | null;
    createdAt:        string;
};

export type TaskStatusUpdate = {
    id:            string;
    taskId:        string;
    fromStatus:    Task['status'];
    toStatus:      Task['status'];
    remark:        string;
    changedBy:     string;
    changedByUser: { id: string; email: string; firstName: string; role: string } | null;
    createdAt:     string;
};

export type TaskPerson = { id: string; email: string; firstName: string; lastName?: string | null; role: string };
export type TaskDepartmentApproval = { departmentId: string; status: 'pending' | 'approved'; decidedAt: string | null; approver: { id: string; firstName: string; lastName?: string | null } | null };

export type Task = {
    id:           string;
    title:        string;
    description:  string | null;
    status:       'draft' | 'todo' | 'in_progress' | 'pending_approval' | 'done' | 'on_hold';
    deletedAt?:   string | null;
    category :    'issue' | 'delegation';
    priority:     'low' | 'medium' | 'high';
    startDate:    string | null;
    dueDate:      string | null;
    reminderMinutesBefore: number | null;
    reminderChannel: 'notification' | 'alarm' | 'email' | 'sms';
    projectId:    string | null;
    assigneeId:   string | null;
    additionalAssigneeIds: string[];
    departmentId: string | null;
    userId:       string;
    createdAt:    string;
    updatedAt:    string;
    verifiedBy:       string | null;
    verifiedAt:       string | null;
    submittedAt?:     string | null;
    approvalStage?:   'HOD' | 'PC' | null;
    hodApprovedBy?:   string | null;
    hodApprovedAt?:   string | null;
    hodApprover?:     { id: string; firstName: string; lastName: string | null } | null;
    awaitingHeadApproval?: boolean;
    departmentApprovals?: TaskDepartmentApproval[];
    assignmentApprovedBy?: string | null;
    assignmentApprovedAt?: string | null;
    assignmentApprover?:   TaskPerson | null;
    declinedAt?:      string | null;
    declinedBy?:      string | null;
    declineReason?:   string | null;
    decliner?:        TaskPerson | null;
    verifier?:        { id: string; firstName: string; lastName: string | null } | null;
    verificationNote: string | null;
    aiMeta?: {
        rawInput : string;
        inputMode : "voice" | "text";
        channel : "whatsapp" | "web";
        extractedAssigneeName : string | null;
        extractedDepartment : string | null;
        confidence : number | null;
        model : string | null;
    } | null;
    checklists?:  TaskChecklist[];
    attachments?: TaskAttachment[];
    tags?: Tag[];
    statusUpdates?: TaskStatusUpdate[];
    checklistSummary?: { total: number; done: number; missingPhotos: number };
    reviewers?: { id: string; firstName: string; lastName: string | null; email: string }[];
};

export type CreateTaskPayload = {
    title:         string;
    description?:  string;
    status?:       Task['status'];
    priority?:     Task['priority'];
    startDate?:    string;
    dueDate?:      string;
    reminderMinutesBefore?: number;
    reminderChannel?: Task['reminderChannel'];
    projectId?:    string;
    assigneeId?:   string;
    additionalAssigneeIds?: string[];
    departmentId?: string;
    tagIds?: string[];
    reviewerIds?: string[];
};

export type SmartTaskParseResult = {
    title : string;
    context : string;
    category : "issue" | "delegated_task";
    assignee : { id : string ; name : string} | null;
    assigneeRaw : string;
    departmentRaw : string;
    dueDate : string;
    priority : Task["priority"];
    confidence : number;
    wonBy : string;
    rawInput : string;
};

export type ConfirmSmartTaskPayload = {
    title : string;
    context? : string;
    category : "issue" | "delegated_task";
    priority : Task["priority"];
    dueDate : string;
    assigneeId? : string;
    departmentId? : string;
    assigneeRaw? : string;
    departmentRaw?: string;
    confidence?:number;
    rawInput:string;
    inputMode : "voice" | "text";
    wonBy? : string;
    channel: "whatsapp" | "web";
}

export type UpdateTaskPayload = Partial<Omit<CreateTaskPayload, 'assigneeId' | 'departmentId' | 'reminderMinutesBefore' | 'startDate' | 'dueDate'>> & {
    assigneeId?: string | null;
    departmentId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    reminderMinutesBefore?: number | null;
    statusRemark?: string;
};

export type VerifyTaskPayload = { action: 'APPROVE' | 'REJECT'; note?: string };

export type ComplianceReportRow = {
    bucket: string;
    totalItems: number;
    doneItems: number;
    completionRate: number | null;
    itemsRequiringPhotos: number;
    qualityRate: number | null;
};

export type TaskOwnerStatsScope = 'department' | 'user' | 'org';
export type TaskOwnerStatsRow = {
    ownerId: string | null;
    total: number;
    done: number;
    overdueCount: number;
    createdCount?: number;
    doneOrWaitingCount?: number;
};

export type ApiResponse<T> = { success: boolean; data: T };

export type ListCounts = { scope: number; options: number; pending: number; completed: number; due: number; delayed: number };
export type ListMeta = { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; loadingMore?: boolean; counts?: ListCounts };
export type TaskListPage = { data: Task[]; meta: ListMeta };

export type TaskListQuery = {
    page: number;
    limit: number;
    sort?: "dueDate" | "priority" | "createdAt" | "title";
    bucket?: "pending" | "completed" | "due" | "delayed";
    category?: "issue" | "delegation" | "task" | "work";
    status?: Task["status"];
    priority?: Task["priority"][];
    departmentId?: string;
    storeId?: string;
    assigneeIds?: string[];
    raisedByIds?: string[];
    tagIds?: string[];
    mine?: boolean;
    handledBy?: "assignee" | "creator";
    createdFrom?: number;
    createdTo?: number;
    dueFrom?: number;
    dueTo?: number;
    sla?: "not_done" | "done_late";
    userId?: string;
};

const taskListParams = (query: TaskListQuery) => {
    const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
    const set = (key: string, value: string | undefined) => { if (value) params.set(key, value); };
    set("sort", query.sort);
    set("bucket", query.bucket);
    set("category", query.category);
    set("filterStatus", query.status);
    set("priority", query.priority?.join(","));
    set("departmentId", query.departmentId);
    set("storeId", query.storeId);
    set("assigneeIds", query.assigneeIds?.join(","));
    set("raisedByIds", query.raisedByIds?.join(","));
    set("tagIds", query.tagIds?.join(","));
    set("handledBy", query.handledBy);
    set("sla", query.sla);
    set("userId", query.userId);
    if (query.mine) params.set("mine", "1");
    const iso = (at: number | undefined) => (at === undefined ? undefined : new Date(at).toISOString());
    set("createdFrom", iso(query.createdFrom));
    set("createdTo", iso(query.createdTo));
    set("dueFrom", iso(query.dueFrom));
    set("dueTo", iso(query.dueTo));
    return params;
};

export type TaskSummary = {
    total: number;
    newToday: number;
    pending: number;
    due: number;
    overdue: number;
    completed: number;
    draft: number;
};

export type TaskPendingApproval = {
    id: string;
    title: string;
    submittedBy: string | null;
    waitingSince: string;
};

const taskArrayDefaults = withArrayDefaults({
    additionalAssigneeIds: arrayField(n.string()),
    checklists: arrayField(taskChecklistDefaults).optional(),
    attachments: arrayField(n.unknown()).optional(),
    statusUpdates: arrayField(n.unknown()).optional(),
    tags: arrayField(n.unknown()).optional(),
    reviewers: arrayField(n.unknown()).optional(),
});
const normalizeTask = (raw: unknown) => normalizeWith<Task>(taskArrayDefaults, raw);

export const taskApi = {
    getAll: (userId?: string, status?: Task['status'], page = 1, limit = 200, tagIds?: string[], archived?: boolean, includeChecklistSummary?: boolean): Promise<TaskListPage> => {
        const params = new URLSearchParams();
        if (userId) params.set('userId', userId);
        if (status) params.set('status', status);
        if (tagIds?.length) params.set('tagIds', tagIds.join(','));
        if (archived) params.set('archived', '1');
        if (includeChecklistSummary) params.set('checklistSummary', '1');
        params.set('page', String(page));
        params.set('limit', String(limit));
        return apiFetch<ApiResponse<Task[]> & { meta: ListMeta }>(`/tasks?${params.toString()}`)
            .then(r => ({ data: r.data.map(normalizeTask), meta: r.meta }));
    },

    getPage: (query: TaskListQuery): Promise<TaskListPage> =>
        apiFetch<ApiResponse<Task[]> & { meta: ListMeta }>(`/tasks?${taskListParams(query).toString()}`)
            .then(r => ({ data: r.data.map(normalizeTask), meta: r.meta })),

    parseSmart: (text: string) =>
        apiFetch<SmartTaskParseResult>('/tasks/ai/parse', { method: 'POST', body: JSON.stringify({ text }) }),

    createFromSmart: (payload: ConfirmSmartTaskPayload) =>
        apiFetch<Task>('/tasks/ai/create', { method: 'POST', body: JSON.stringify(payload) }),

    transcribeVoiceNote: (audioBlob: Blob) => {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice-note.webm');
        return apiFetch<{ transcript: string }>('/tasks/ai/transcribe', { method: 'POST', body: formData });
    },

    getOne: (id: string) => apiFetch<ApiResponse<Task>>(`/tasks/${id}`).then(r => normalizeTask(r.data)),

    getSummary: (scope: SummaryScope = 'mine'): Promise<TaskSummary> =>
        apiFetch<ApiResponse<TaskSummary>>(`/tasks/summary?scope=${scope}`).then(r => r.data),

    getPendingApproval: (): Promise<PendingApprovalPreview<TaskPendingApproval>> =>
        apiFetch<ApiResponse<TaskPendingApproval[]> & { meta?: { total: number } }>('/tasks/pending-approval')
            .then(r => ({ rows: r.data, total: r.meta?.total ?? r.data.length })),

    create: (payload: CreateTaskPayload) =>
        apiFetch<ApiResponse<Task>>('/tasks', { method: 'POST', body: JSON.stringify(payload) }).then(r => normalizeTask(r.data)),

    update: (id: string, payload: UpdateTaskPayload) =>
        apiFetch<ApiResponse<Task>>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then(r => normalizeTask(r.data)),

    verify: (id: string, payload: VerifyTaskPayload) =>
        apiFetch<ApiResponse<Task>>(`/tasks/${id}/verify`, { method: 'PATCH', body: JSON.stringify(payload) }).then(r => normalizeTask(r.data)),

    approveAssignment: (id: string) =>
        apiFetch<ApiResponse<Task>>(`/tasks/${id}/approve-assignment`, { method: 'POST' }).then(r => normalizeTask(r.data)),

    decline: (id: string, reason: string) =>
        apiFetch<ApiResponse<Task>>(`/tasks/${id}/decline`, { method: 'POST', body: JSON.stringify({ reason }) }).then(r => normalizeTask(r.data)),

    reopenDeclined: (id: string) =>
        apiFetch<ApiResponse<Task>>(`/tasks/${id}/reopen-declined`, { method: 'POST' }).then(r => normalizeTask(r.data)),

    delete: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/tasks/${id}`, { method: 'DELETE' }),

    restore: (id: string) =>
        apiFetch<ApiResponse<Task>>(`/tasks/${id}/restore`, { method: 'PATCH' }).then(r => normalizeTask(r.data)),

    getComplianceReport: (groupBy: 'day' | 'week' | 'month' | 'year' | 'none' = 'month', from?: string, to?: string, departmentId?: string, userId?: string) => {
        const params = new URLSearchParams({ groupBy });
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (departmentId) params.set('departmentId', departmentId);
        if (userId) params.set('userId', userId);
        return apiFetch<ApiResponse<ComplianceReportRow[]>>(`/tasks/reports/compliance?${params.toString()}`);
    },

    getOwnerStats: (scope: TaskOwnerStatsScope, from?: string, to?: string, departmentId?: string) => {
        const params = new URLSearchParams({ scope });
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (departmentId) params.set('departmentId', departmentId);
        return apiFetch<ApiResponse<TaskOwnerStatsRow[]>>(`/tasks/reports/by-owner?${params.toString()}`);
    },

    uploadAttachments: async (taskId: string, files: File[]) => {
        const formData = new FormData();
        (await shrinkImages(files)).forEach(f => formData.append('files', f));
        return apiFetch<ApiResponse<TaskAttachment[]>>(`/tasks/${taskId}/attachments`, {
            method: 'POST',
            body:   formData,
        });
    },

    deleteAttachment: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/task-attachments/${id}`, { method: 'DELETE' }),
};
