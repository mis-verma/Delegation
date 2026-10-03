import { z } from 'zod';
import { apiFetch } from './http';
import { arrayField, withArrayDefaults, normalizeWith } from './normalize';
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

export type Task = {
    id:           string;
    title:        string;
    description:  string | null;
    status:       'draft' | 'todo' | 'in_progress' | 'pending_approval' | 'done';
    /** Soft-delete marker — non-null means this delegation is in the Archived view. */
    deletedAt?:   string | null;
    category :    'issue' | 'delegation';
    priority:     'low' | 'medium' | 'high';
    startDate:    string | null;
    dueDate:      string | null;
    reminderMinutesBefore: number | null;
    reminderChannel: 'notification' | 'alarm' | 'email' | 'sms';
    projectId:    string | null;
    assigneeId:   string | null;
    // Extra people beyond the primary assigneeId — see Task.ts model for why they're separate.
    additionalAssigneeIds: string[];
    departmentId: string | null;
    userId:       string;
    createdAt:    string;
    updatedAt:    string;
    verifiedBy:       string | null;
    verifiedAt:       string | null;
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
    /** Labels, alphabetical. Returned by both the list and detail endpoints. */
    tags?: Tag[];
    /** Newest first. Only the detail endpoint returns these — list responses omit them. */
    statusUpdates?: TaskStatusUpdate[];
    /** Only present when the list call opts in via `includeChecklistSummary` (the Verification
     *  Queue does) — a done/total/missing-photo rollup so a collapsed row can show completion
     *  status without fetching the full checklist. */
    checklistSummary?: { total: number; done: number; missingPhotos: number };
    /** Explicit reviewers — additive on top of the role-based verify rule (ADMIN/PC always,
     *  MANAGER/HOD within the task's own department). Anyone named here can approve/reject this
     *  delegation regardless of role or department. Returned by create/update/getById. */
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
    /**
     * Label ids to attach. Server caps the array at 12.
     *
     * On a PATCH, omitting this leaves the delegation's labels alone; sending `[]` clears them.
     * That distinction matters — a status move PATCH must not wipe the labels as a side effect.
     */
    tagIds?: string[];
    /** User ids to name as explicit reviewers — see Task['reviewers']. Same omit/empty-array
     *  convention as tagIds. */
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

export type UpdateTaskPayload = Partial<Omit<CreateTaskPayload, 'assigneeId' | 'departmentId' | 'reminderMinutesBefore'>> & {
    assigneeId?: string | null;
    departmentId?: string | null;
    reminderMinutesBefore?: number | null;
    /** Required by the server whenever `status` differs from what's stored. */
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
};

export type ApiResponse<T> = { success: boolean; data: T };

export type ListMeta = { page: number; limit: number; total: number; totalPages: number; hasNext: boolean };
export type TaskListPage = { data: Task[]; meta: ListMeta };

/** Mirrors the server's TaskSummaryRow (task.service.ts) — powers the sidebar's "Delegation"
 *  count badge and its hover breakdown. Always "mine" (creator/assignee/additional assignee), not
 *  org-wide, regardless of role — see the summary() doc comment server-side for why. */
export type TaskSummary = {
    total: number;
    newToday: number;
    due: number;
    overdue: number;
    completed: number;
    draft: number;
};

/** Dashboard's "Needs your approval" card — one row per delegation currently awaiting an
 *  ADMIN/PC's sign-off. Org-wide (not "mine" like TaskSummary above), matching who can act on it. */
export type TaskPendingApproval = {
    id: string;
    title: string;
    submittedBy: string | null;
    waitingSince: string;
};

// additionalAssigneeIds is the field that actually crashed the dashboard (spread of an undefined
// value) — checklists/attachments are the same "typed as always-present" shape and just haven't
// bitten yet, so they're guarded the same way rather than waiting for their own crash report.
const taskArrayDefaults = withArrayDefaults({
    additionalAssigneeIds: arrayField(z.string()),
    // Nested via taskChecklistDefaults, not a bare arrayField(z.unknown()) — a checklist that's
    // present but missing its own `items` (or an item missing its `images`) is exactly the shape
    // that crashed ChecklistBlock's `checklist.items.filter(...)` before this was added.
    checklists: arrayField(taskChecklistDefaults).optional(),
    attachments: arrayField(z.unknown()).optional(),
    statusUpdates: arrayField(z.unknown()).optional(),
    // Same guard as the rest: every view maps over this, so a response that omits it (an older
    // server, or a code path that forgets the join) must yield [] rather than crash the render.
    tags: arrayField(z.unknown()).optional(),
    reviewers: arrayField(z.unknown()).optional(),
});
const normalizeTask = (raw: unknown) => normalizeWith<Task>(taskArrayDefaults, raw);

export const taskApi = {
    // Returns the page AND its meta. `limit` is now sent explicitly rather than relying on the
    // server's default, and `meta.total` is what lets a caller tell "this is everything" apart
    // from "this is the first `limit` of N" — the distinction the old bare-array response lost.
    getAll: (userId?: string, status?: Task['status'], page = 1, limit = 200, tagIds?: string[], archived?: boolean, includeChecklistSummary?: boolean): Promise<TaskListPage> => {
        const params = new URLSearchParams();
        if (userId) params.set('userId', userId);
        if (status) params.set('status', status);
        // Server-side so the page's counts describe the filtered set rather than a client-side
        // slice of a truncated page. Matched as OR — any of these labels.
        if (tagIds?.length) params.set('tagIds', tagIds.join(','));
        if (archived) params.set('archived', '1');
        if (includeChecklistSummary) params.set('checklistSummary', '1');
        params.set('page', String(page));
        params.set('limit', String(limit));
        return apiFetch<ApiResponse<Task[]> & { meta: ListMeta }>(`/tasks?${params.toString()}`)
            .then(r => ({ data: r.data.map(normalizeTask), meta: r.meta }));
    },

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

    getSummary: (): Promise<TaskSummary> =>
        apiFetch<ApiResponse<TaskSummary>>('/tasks/summary').then(r => r.data),

    getPendingApproval: (): Promise<TaskPendingApproval[]> =>
        apiFetch<ApiResponse<TaskPendingApproval[]>>('/tasks/pending-approval').then(r => r.data),

    create: (payload: CreateTaskPayload) =>
        apiFetch<ApiResponse<Task>>('/tasks', { method: 'POST', body: JSON.stringify(payload) }).then(r => normalizeTask(r.data)),

    update: (id: string, payload: UpdateTaskPayload) =>
        apiFetch<ApiResponse<Task>>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then(r => normalizeTask(r.data)),

    verify: (id: string, payload: VerifyTaskPayload) =>
        apiFetch<ApiResponse<Task>>(`/tasks/${id}/verify`, { method: 'PATCH', body: JSON.stringify(payload) }).then(r => normalizeTask(r.data)),

    delete: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/tasks/${id}`, { method: 'DELETE' }),

    restore: (id: string) =>
        apiFetch<ApiResponse<Task>>(`/tasks/${id}/restore`, { method: 'PATCH' }).then(r => normalizeTask(r.data)),

    // 'none' = one bucket named 'range' for the whole from/to window.
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

    uploadAttachments: (taskId: string, files: File[]) => {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        return apiFetch<ApiResponse<TaskAttachment[]>>(`/tasks/${taskId}/attachments`, {
            method: 'POST',
            body:   formData,
        });
    },

    deleteAttachment: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/task-attachments/${id}`, { method: 'DELETE' }),
};
