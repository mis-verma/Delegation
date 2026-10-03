import { useQuery , useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { taskApi } from "../../api/task";
import { userApi } from "../../api/users"; // NEW — needed for the assignee picker
import { taskChecklistApi } from "../../api/taskChecklist";
import { checklistTemplateApi } from "../../api/checklistTemplates";
import { taskCommentApi } from "../../api/taskComment";
import type { CreateTaskCommentPayload } from "../../api/taskComment";
import { smartTaskConversationApi } from "../../api/smartTaskConversation";
import type { SmartTaskConversationMessage, PatchSmartTaskConversationPayload } from "../../api/smartTaskConversation";
import type { CreateTaskPayload, UpdateTaskPayload, VerifyTaskPayload, Task } from "../../api/task";
import type {
    CreateTaskChecklistPayload,
    UpdateTaskChecklistItemPayload,
    CaptureMethod,
} from "../../api/taskChecklist";
import { handleQueryRetry, useEntityMutation, patchEntityInCache, errorMessage } from "../../lib/queryHelpers";
import type { ConfirmSmartTaskPayload } from "../../api/task";
import { taskBulkImportApi } from "../../api/taskBulkImport";
import type { TaskBulkImportPublishPayload } from "../../api/taskBulkImport";
import { toast } from "sonner";

const TASK_KEYS = {
    // The cache key includes which user's tasks we're looking at, so "my tasks" and "some other
    // user's tasks" (from the admin page) never collide or overwrite each other in the cache.
    // 'mine' is just a readable placeholder for "no filter".
    // The cache key carries every server-side filter, not just the user. Leaving one out is the
    // exact bug the ticket list had: two callers asking for different slices shared one entry and
    // whichever mounted first decided what everybody else saw. Tag ids are sorted and joined so
    // the same selection in a different click order is the same key.
    all: (userId?: string, tagIds?: string[]) =>
        ['tasks', userId ?? 'mine', [...(tagIds ?? [])].sort().join(',')] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
    drafts: ['tasks', 'draft'] as const,
    archived: ['tasks', 'archived'] as const,
};

// List tasks — optionally scoped to one specific user's tasks (that scoping is admin-only,
// enforced server-side in task.service.ts; a non-admin passing a userId here is just ignored).
// `enabled` lets a caller (e.g. the header's quick search) defer the fetch until it's actually
// needed, instead of every mount pulling the full list regardless of whether it's used yet.
export const useTasksQuery = (userId?: string, enabled = true, tagIds?: string[]) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: TASK_KEYS.all(userId, tagIds),
        queryFn:  () => taskApi.getAll(userId, undefined, 1, 200, tagIds),
        // `select` keeps this hook's `data` a plain Task[], which is what all six call sites
        // already expect — the paging meta rides along in the cache entry and is read through
        // useTasksMetaQuery below rather than by widening every consumer's shape.
        select: (page) => page.data,
        enabled:  !!token && enabled,
        retry: handleQueryRetry,
    });
};

// The sidebar's "Delegation" count badge and its hover breakdown — a real server-side aggregate
// (task.service.ts#summary), not a client-side reduce over useTasksQuery's own 200-row page,
// which would silently undercount past that cap and would also pull the whole list just to count
// it on every route (the sidebar renders everywhere).
export const useTaskSummaryQuery = (enabled = true) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['tasks', 'summary'] as const,
        queryFn: () => taskApi.getSummary(),
        enabled: !!token && enabled,
        retry: handleQueryRetry,
    });
};

// Dashboard's "Needs your approval" card — `enabled` is the caller's own role check (ADMIN/PC
// only), same convention as useTaskSummaryQuery's own `enabled` param, so a USER/MANAGER never
// fires a request the route would 403 anyway.
export const useTaskPendingApprovalQuery = (enabled = true) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['tasks', 'pending-approval'] as const,
        queryFn: () => taskApi.getPendingApproval(),
        enabled: !!token && enabled,
        retry: handleQueryRetry,
    });
};

// Same query key, so this shares the one request/cache entry useTasksQuery already made — it just
// selects the other half of the response. Lets a list surface "showing 200 of 1,240" instead of
// presenting a truncated page as the complete set.
export const useTasksMetaQuery = (userId?: string, enabled = true, tagIds?: string[]) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: TASK_KEYS.all(userId, tagIds),
        queryFn:  () => taskApi.getAll(userId, undefined, 1, 200, tagIds),
        select: (page) => page.meta,
        enabled:  !!token && enabled,
        retry: handleQueryRetry,
    });
};

// Draft Delegations — pre-publication scratch items, only ever the caller's own (see
// task.service.ts#list's status === 'draft' branch, which ignores role/department reach
// entirely). Its own cache key/query, not a filtered view of useTasksQuery's data, since the
// server excludes drafts from that default fetch by design.
export const useDraftTasksQuery = () => {
    const { token } = useAuth();
    return useQuery({
        queryKey: TASK_KEYS.drafts,
        queryFn: () => taskApi.getAll(undefined, 'draft'),
        select: (page) => page.data,
        enabled: !!token,
        retry: handleQueryRetry,
    });
};

// Archived Delegations — soft-deleted tasks, same creator/assignee/department/org-wide
// visibility scope the live list uses, just the other side of deletedAt.
export const useArchivedTasksQuery = () => {
    const { token } = useAuth();
    return useQuery({
        queryKey: TASK_KEYS.archived,
        queryFn: () => taskApi.getAll(undefined, undefined, 1, 200, undefined, true),
        select: (page) => page.data,
        enabled: !!token,
        retry: handleQueryRetry,
    });
};

export const useRestoreTaskMutation = () =>
    useEntityMutation({
        mutationFn: (id: string) => taskApi.restore(id),
        // Leaves the Archived list (row is no longer archived) and needs to show up in the
        // ordinary task list/board/table again.
        invalidateKeys: [['tasks']],
        successMessage: 'Delegation restored',
        errorFallback: 'Failed to restore delegation',
    });

// "Publish" is just an ordinary status-change PATCH (draft -> todo) through the same mechanism
// every other status move already goes through — the server's generic status-change path (no
// special-cased guard for this transition) handles it as-is. The remark is fixed rather than
// prompted for: requiring someone to type a "reason" for a delegation's very first activation,
// the same way a later todo -> in_progress move would, is friction with nothing real behind it.
export const usePublishDraftTaskMutation = () =>
    useEntityMutation({
        mutationFn: (id: string) => taskApi.update(id, { status: 'todo', statusRemark: 'Published from draft.' }),
        invalidateKeys: [['tasks']],
        successMessage: 'Delegation published',
        errorFallback: 'Failed to publish delegation',
    });

// Checklist completion rate over time — role-scoped server-side (ADMIN/PC get the org-wide
// or department view, everyone else only ever sees their own tasks). Powers the dashboard's
// Monthly Target gauge, and (via departmentId/userId) the Team Overview drill-down.
export const useComplianceReportQuery = (groupBy: 'day' | 'week' | 'month' | 'year' = 'month', from?: string, to?: string, departmentId?: string, userId?: string) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['tasks', 'compliance', groupBy, from, to, departmentId, userId],
        queryFn: () => taskApi.getComplianceReport(groupBy, from, to, departmentId, userId).then(r => r.data),
        enabled: !!token,
        retry: handleQueryRetry,
    });
};

// Single task by id. `enabled` (default true) lets a caller defer the fetch until it's actually
// needed — e.g. the Verification Queue's inline checklist preview, which only wants a task's full
// checklist tree (absent from the list response) once its row is actually expanded, not for every
// row in the queue up front.
export const useTaskQuery = (id: string, enabled = true) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: TASK_KEYS.detail(id),
        queryFn:  () => taskApi.getOne(id),
        enabled:  !!token && !!id && enabled,
        retry: handleQueryRetry,
    });
};

export const useCreateTaskMutation = () =>
    useEntityMutation({
        mutationFn: (payload: CreateTaskPayload) => taskApi.create(payload),
        invalidateKeys: [['tasks']],
        successMessage: 'Task created',
        errorFallback: 'Failed to create task',
    });

// Create + upload any files staged in the form, as one mutation — there's no task id to upload
// attachments against until create() has actually returned one, so this awaits that first, then
// uploads (if any files were staged) before resolving. Lets TaskForm's own attach toolbar work
// the same way the Activity composer's does: pick files while writing, they land once you submit.
export const useCreateTaskWithAttachmentsMutation = () =>
    useEntityMutation({
        mutationFn: async ({ payload, files }: { payload: CreateTaskPayload; files: File[] }) => {
            const created = await taskApi.create(payload);
            if (files.length) await taskApi.uploadAttachments(created.id, files);
            return created;
        },
        invalidateKeys: [['tasks']],
        successMessage: (created) => (created.status === 'draft' ? 'Saved as draft' : 'Task created'),
        errorFallback: 'Failed to create task',
    });

// `silent: true` drops the success toast (still errors loudly on failure) — used by TaskDetail's
// per-field autosave, where a toast on every single edit is noise; the board/row quick-status
// actions call this with no options so they keep the confirmation toast.
export const useUpdateTaskMutation = (options?: { silent?: boolean }) =>
    useEntityMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateTaskPayload }) =>
            taskApi.update(id, payload),
        setDetailData: (updatedTask) => ({ key: TASK_KEYS.detail(updatedTask.id), data: updatedTask }),
        invalidateKeys: [['tasks']],
        // Completing/updating a task (board quick-actions, detail autosave) should reflect
        // immediately rather than waiting on the server round-trip.
        optimisticUpdate: {
            keyPrefixes: [['tasks']],
            apply: ({ id, payload }) => (old) => patchEntityInCache<Task>(old, id, payload),
        },
        successMessage: options?.silent ? null : 'Task updated',
        errorFallback: 'Failed to update task',
    });

// Powers the PC verification queue — tasks waiting on a given status (pending_approval),
// scoped server-side to whatever the requester is allowed to see (PC/ADMIN get their department).
export const useTasksByStatusQuery = (status: Task['status'], enabled = true) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['tasks', 'by-status', status],
        // checklistSummary=true — the only caller of this hook is the Verification Queue, which
        // shows each row's done/total/missing-photo rollup before it's even expanded.
        queryFn: () => taskApi.getAll(undefined, status, 1, 200, undefined, undefined, true),
        select: (page) => page.data,
        enabled: !!token && enabled,
        retry: handleQueryRetry,
    });
};

export const useVerifyTaskMutation = () =>
    useEntityMutation({
        mutationFn: ({ id, payload }: { id: string; payload: VerifyTaskPayload }) =>
            taskApi.verify(id, payload),
        setDetailData: (updatedTask) => ({ key: TASK_KEYS.detail(updatedTask.id), data: updatedTask }),
        invalidateKeys: [['tasks']],
        successMessage: (updatedTask) => (updatedTask.status === 'done' ? 'Task verified and marked done' : 'Task sent back'),
        errorFallback: 'Failed to verify task',
    });

export const useDeleteTaskMutation = () =>
    useEntityMutation({
        mutationFn: (id: string) => taskApi.delete(id),
        removeKey: (_result, id) => TASK_KEYS.detail(id),
        invalidateKeys: [['tasks']],
        successMessage: 'Task deleted',
        errorFallback: 'Failed to delete task',
    });

// NEW — powers the "Assign to" dropdown in TaskForm.tsx. Calls the same `/users/assignable`
// endpoint that features/tickets/hook.ts's useAssignableUsersQuery already uses.
export const useAssignableUsersQuery = () => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['assignable-users', 'all'],
        queryFn:  () => userApi.getAssignable().then(r => r.data),
        enabled:  !!token,
        retry: handleQueryRetry,
    });
};

// ── Bulk import (CSV/Excel → many delegations) ──────────────────────────
// Same split as the checklist bulk-importer's two hooks: preview only reads and matches, so it
// invalidates nothing; publish is the one step that actually creates delegations.
export const useTaskBulkImportPreviewMutation = () =>
    useMutation({
        mutationFn: (file: File) => taskBulkImportApi.preview(file).then(r => r.data),
        onError: (err) => toast.error(errorMessage(err, 'Failed to read that file')),
    });

export const useTaskBulkImportPublishMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: TaskBulkImportPublishPayload) => taskBulkImportApi.publish(payload).then(r => r.data),
        // Same key useCreateTaskWithAttachmentsMutation invalidates — prefix-matches every
        // list/detail/compliance query under 'tasks'.
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['analytics'] });
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to publish this batch')),
    });
};

// ── Task activity/comments ──────────────────────────────────────────────
export const useTaskCommentsQuery = (taskId: string) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: [...TASK_KEYS.detail(taskId), 'comments'],
        queryFn: () => taskCommentApi.list(taskId),
        enabled: !!token && !!taskId,
        retry: handleQueryRetry,
    });
};

export const useCreateTaskCommentMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (payload: CreateTaskCommentPayload) => taskCommentApi.create(taskId, payload),
        invalidateKeys: [[...TASK_KEYS.detail(taskId), 'comments']],
        errorFallback: 'Failed to post comment',
    });

// ── Task checklists (items, images, remarks) ──────────────────────────────
// All of these only ever affect one task's detail view, so they invalidate just that task's
// detail query key — no need to touch the list queries, since checklist progress isn't shown there.

export const useAddTaskChecklistMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (payload: CreateTaskChecklistPayload) => taskChecklistApi.create(taskId, payload).then(r => r.data),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Checklist added',
        errorFallback: 'Failed to add checklist',
    });

export const useDeleteTaskChecklistMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (id: string) => taskChecklistApi.deleteChecklist(id),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Checklist deleted',
        errorFallback: 'Failed to delete checklist',
    });

export const useUpdateTaskChecklistItemMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateTaskChecklistItemPayload }) =>
            taskChecklistApi.updateItem(id, payload).then(r => r.data),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        errorFallback: 'Failed to update item',
    });

export const useUpdateTaskItemRemarksMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: ({ id, remarks }: { id: string; remarks: string }) =>
            taskChecklistApi.updateRemarks(id, remarks).then(r => r.data),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Remarks saved',
        errorFallback: 'Failed to save remarks',
    });

export const useCompleteTaskChecklistItemMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (id: string) => taskChecklistApi.completeItem(id).then(r => r.data),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Item marked complete',
        errorFallback: 'Failed to complete item',
    });

export const useDeleteTaskChecklistItemMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (id: string) => taskChecklistApi.deleteItem(id),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Item deleted',
        errorFallback: 'Failed to delete item',
    });

export const useUploadTaskImagesMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: ({ itemId, files, captureMethod }: { itemId: string; files: File[]; captureMethod: CaptureMethod }) =>
            taskChecklistApi.uploadImages(itemId, files, captureMethod).then(r => r.data),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Photos uploaded',
        errorFallback: 'Failed to upload photos',
    });

export const useDeleteTaskImageMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (id: string) => taskChecklistApi.deleteImage(id),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Photo deleted',
        errorFallback: 'Failed to delete photo',
    });

// Reusable checklist templates (managed under Admin) that can be applied to a task in one
// click instead of typing the same checklist out by hand — see features/admin/ChecklistTemplateList.tsx.
export const useChecklistTemplatesQuery = () => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['checklist-templates', 'TASK'],
        queryFn: () => checklistTemplateApi.getAll('TASK').then(r => r.data),
        enabled: !!token,
        retry: handleQueryRetry,
    });
};

export const useApplyChecklistTemplateMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (templateId: string) => checklistTemplateApi.applyToTask(taskId, templateId),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Template applied',
        errorFallback: 'Failed to apply template',
    });

export const useCreateSmartTaskMutation = () => 
    useEntityMutation({
        mutationFn : (payload : ConfirmSmartTaskPayload) => taskApi.createFromSmart(payload),
        invalidateKeys : [["tasks"]], 
        successMessage : "Task created from AI Input",
        errorFallback : "Failed to create task"
    })

export const useParseSmartTaskMutation = () =>
    useMutation({ mutationFn : (text : string) => taskApi.parseSmart(text)});

export const useTranscribeVoiceNoteMutation = () =>
    useMutation({ mutationFn : (audioBlob : Blob) => taskApi.transcribeVoiceNote(audioBlob)});

// ── Smart Add chat history ─────────────────────────────────────────────
// Plain useQuery/useMutation rather than useEntityMutation — these are background saves fired on
// every chat turn, and a success toast on every message would be noisy. The list is invalidated on
// create/patch so History reflects the latest state next time it's opened; over-invalidating on a
// plain append is harmless since the list only actually refetches when it's mounted and viewed.
const SMART_TASK_CONVERSATION_KEYS = {
    all:    ['smart-task-conversations'] as const,
    detail: (id: string) => ['smart-task-conversations', id] as const,
};

// `enabled` defaults to true but is meant to be passed `view === "history"` from SmartTaskModal —
// no reason to fetch the whole history list every time Smart Add opens if the user never clicks
// through to it.
export const useSmartTaskConversationsQuery = (enabled = true) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: SMART_TASK_CONVERSATION_KEYS.all,
        queryFn: () => smartTaskConversationApi.list(),
        enabled: !!token && enabled,
        retry: handleQueryRetry,
    });
};

export const useSmartTaskConversationQuery = (id: string | null) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: SMART_TASK_CONVERSATION_KEYS.detail(id ?? ''),
        queryFn: () => smartTaskConversationApi.getOne(id!),
        enabled: !!token && !!id,
        retry: handleQueryRetry,
    });
};

export const useCreateSmartTaskConversationMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (messages: SmartTaskConversationMessage[]) => smartTaskConversationApi.create(messages),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: SMART_TASK_CONVERSATION_KEYS.all }),
    });
};

export const useUpdateSmartTaskConversationMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: PatchSmartTaskConversationPayload }) =>
            smartTaskConversationApi.patch(id, payload),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: SMART_TASK_CONVERSATION_KEYS.all }),
    });
};

export const useDeleteAllSmartTaskConversationsMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => smartTaskConversationApi.deleteAll(),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: SMART_TASK_CONVERSATION_KEYS.all }),
    });
};