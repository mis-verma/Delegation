import { useCallback, useRef } from "react";
import { useQuery , useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { activityQueryOptions } from "../../components/activityTimeline/activityQuery";
import { useAuth } from "../../context/AuthContext";
import { taskApi } from "../../api/task";
import { userApi } from "../../api/users"; // NEW — needed for the assignee picker
import { taskChecklistApi } from "../../api/taskChecklist";
import { checklistTemplateApi } from "../../api/checklistTemplates";
import { smartTaskConversationApi } from "../../api/smartTaskConversation";
import type { SmartTaskConversationMessage, PatchSmartTaskConversationPayload } from "../../api/smartTaskConversation";
import type { CreateTaskPayload, UpdateTaskPayload, VerifyTaskPayload, Task, TaskListPage, ListMeta } from "../../api/task";
import type {
    CreateTaskChecklistPayload,
    UpdateTaskChecklistItemPayload,
    CaptureMethod,
} from "../../api/taskChecklist";
import { handleQueryRetry, useEntityMutation, patchEntityInCache, notifyError, invalidateScoreCaches } from "../../lib/queryHelpers";
import type { ConfirmSmartTaskPayload } from "../../api/task";
import { taskBulkImportApi } from "../../api/taskBulkImport";
import { PUBLISH_REMARK } from "./taskStatusModel";
import type { TaskBulkImportPublishPayload } from "../../api/taskBulkImport";
import type { SummaryScope } from "../../api/http";
import type { DashboardQueryOptions } from "../../lib/dashboardQuery";

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
// Shared by the list, its meta twin and the route prefetch, so all three hit one cache entry.
// useTaskSocket is mounted app-wide and invalidates ['tasks'] on every delegation event, so the
// 2-minute window only skips the refetch-on-revisit; it cannot leave stale rows on screen.
// Pages of 200 (the server's ceiling), read until the server says there are no more. The list's
// tiles and filters count client-side, so a single page made "Delayed" miss every older overdue
// delegation. MAX_LIST_PAGES is a safety stop (4,000 rows), the same one useTeamWork uses.
const LIST_PAGE_SIZE = 200;
const MAX_LIST_PAGES = 20;

const fetchAllTaskPages = async (userId?: string, tagIds?: string[]): Promise<TaskListPage> => {
    const all: Task[] = [];
    let meta: ListMeta | undefined;
    for (let page = 1; page <= MAX_LIST_PAGES; page++) {
        const res = await taskApi.getAll(userId, undefined, page, LIST_PAGE_SIZE, tagIds);
        all.push(...res.data);
        meta = res.meta;
        if (!res.meta?.hasNext) break;
    }
    // One combined page: `total` is the server's real count and `hasNext` is only still true when the
    // safety stop cut the list short, which is what the list's "newest N of M" note reads.
    const total = meta?.total ?? all.length;
    return {
        data: all,
        meta: { page: 1, limit: all.length, total, totalPages: 1, hasNext: all.length < total },
    };
};

export const tasksListQueryOptions = (userId?: string, tagIds?: string[]) => ({
    queryKey: TASK_KEYS.all(userId, tagIds),
    queryFn:  () => fetchAllTaskPages(userId, tagIds),
    staleTime: 2 * 60_000,
});

export const useTasksQuery = (userId?: string, enabled = true, tagIds?: string[], options?: DashboardQueryOptions) => {
    const { token } = useAuth();
    return useQuery({
        ...tasksListQueryOptions(userId, tagIds),
        // `select` keeps this hook's `data` a plain Task[], which is what all six call sites
        // already expect — the paging meta rides along in the cache entry and is read through
        // useTasksMetaQuery below rather than by widening every consumer's shape.
        select: (page) => page.data,
        enabled:  !!token && enabled,
        retry: handleQueryRetry,
        // Changing the label filter keeps the current rows up instead of dropping to a skeleton.
        placeholderData: keepPreviousData,
        ...options,
    });
};

// Server-side delegation counts (task.service.ts#summary), not a client-side reduce over
// useTasksQuery's own 200-row page, which would silently undercount past that cap and would also
// pull the whole list just to count it. `scope` picks the slice: 'mine' (assigned to me, the
// sidebar badge's default) or 'visible' (everything this role can see; org-wide for ADMIN/PC).
// The scope is part of the key, so the two never share a cache entry.
export const useTaskSummaryQuery = (scope: SummaryScope = 'mine', enabled = true, options?: DashboardQueryOptions) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['tasks', 'summary', scope] as const,
        queryFn: () => taskApi.getSummary(scope),
        enabled: !!token && enabled,
        retry: handleQueryRetry,
        ...options,
    });
};

// Dashboard's "Needs your approval" card — `enabled` is the caller's own role check (ADMIN/PC
// only), same convention as useTaskSummaryQuery's own `enabled` param, so a USER/MANAGER never
// fires a request the route would 403 anyway. Returns the oldest few rows plus the real queue size.
export const useTaskPendingApprovalQuery = (enabled = true, options?: DashboardQueryOptions) => {
    const { token } = useAuth();
    return useQuery({
        queryKey: ['tasks', 'pending-approval'] as const,
        queryFn: () => taskApi.getPendingApproval(),
        enabled: !!token && enabled,
        retry: handleQueryRetry,
        ...options,
    });
};

// Same query key, so this shares the one request/cache entry useTasksQuery already made — it just
// selects the other half of the response. Lets a list surface "showing 200 of 1,240" instead of
// presenting a truncated page as the complete set.
export const useTasksMetaQuery = (userId?: string, enabled = true, tagIds?: string[]) => {
    const { token } = useAuth();
    return useQuery({
        ...tasksListQueryOptions(userId, tagIds),
        select: (page) => page.meta,
        enabled:  !!token && enabled,
        retry: handleQueryRetry,
        placeholderData: keepPreviousData,
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
        retryable: true,
        errorFallback: "Couldn't restore the delegation. Try again.",
    });

// "Publish" is just an ordinary status-change PATCH (draft -> todo) through the same mechanism
// every other status move already goes through — the server's generic status-change path (no
// special-cased guard for this transition) handles it as-is. The remark is fixed rather than
// prompted for: requiring someone to type a "reason" for a delegation's very first activation,
// the same way a later todo -> in_progress move would, is friction with nothing real behind it.
export const usePublishDraftTaskMutation = () =>
    useEntityMutation({
        mutationFn: (id: string) => taskApi.update(id, { status: 'todo', statusRemark: PUBLISH_REMARK }),
        invalidateKeys: [['tasks']],
        successMessage: 'Delegation published',
        retryable: true,
        errorFallback: "Couldn't publish the delegation. Try again.",
    });

// Single task by id. `enabled` (default true) lets a caller defer the fetch until it's actually
// needed — e.g. the Verification Queue's inline checklist preview, which only wants a task's full
// checklist tree (absent from the list response) once its row is actually expanded, not for every
// row in the queue up front.
export const taskDetailQueryOptions = (id: string) => ({
    queryKey: TASK_KEYS.detail(id),
    queryFn:  () => taskApi.getOne(id),
});

// Warms a delegation's full record and its activity before the card is clicked, same intent
// rule as the ticket card: a mouse waits 150ms on the card (so sweeping across a board doesn't
// fire two requests per card), a finger or keyboard focus goes at once. Spread on the card.
export const usePrefetchTask = (id: string) => {
    const queryClient = useQueryClient();
    const { token } = useAuth();
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const run = useCallback(() => {
        if (!token) return;
        void queryClient.prefetchQuery({ ...taskDetailQueryOptions(id), staleTime: 30_000 });
        void queryClient.prefetchQuery(activityQueryOptions('Task', id));
    }, [queryClient, token, id]);
    const cancel = useCallback(() => clearTimeout(timer.current), []);

    return {
        onMouseEnter: () => { cancel(); timer.current = setTimeout(run, 150); },
        onMouseLeave: cancel,
        onFocus: run,
        onTouchStart: run,
    };
};

export const useTaskQuery = (id: string, enabled = true) => {
    const { token } = useAuth();
    return useQuery({
        ...taskDetailQueryOptions(id),
        enabled:  !!token && !!id && enabled,
        retry: handleQueryRetry,
    });
};

// Create + upload any files staged in the form, as one mutation — there's no task id to upload
// attachments against until create() has actually returned one, so this awaits that first, then
// uploads (if any files were staged) before resolving. Lets TaskForm's own attach toolbar work
// the same way the Activity composer's does: pick files while writing, they land once you submit.
//
// Once create() has returned, the delegation exists. A failed upload after that must not fail the
// whole mutation: the form used to stay open saying "Failed to create task", and pressing Create
// again made a second copy. So the upload's failure is reported as `filesFailed` on a successful
// result instead, and the form closes with a toast saying the files need adding again.
export const useCreateTaskWithAttachmentsMutation = () =>
    useEntityMutation({
        mutationFn: async ({ payload, files }: { payload: CreateTaskPayload; files: File[] }): Promise<Task & { filesFailed: boolean }> => {
            const created = await taskApi.create(payload);
            let filesFailed = false;
            if (files.length) {
                try {
                    await taskApi.uploadAttachments(created.id, files);
                } catch {
                    filesFailed = true;
                }
            }
            return { ...created, filesFailed };
        },
        invalidateKeys: [['tasks']],
        // The toast is the caller's (TaskForm), which knows whether the files made it. A failure is
        // shown inline next to the form's buttons, so no error toast either.
        successMessage: null,
        errorFallback: "Couldn't create the delegation. Try again.",
        errorToast: false,
    });

// `silent: true` drops the success toast (still errors loudly on failure) — used by TaskDetail's
// per-field autosave, where a toast on every single edit is noise; the board/row quick-status
// actions call this with no options so they keep the confirmation toast.
// `quietErrors: true` drops the error toast too, for callers that show the failure beside the field
// that failed (TaskDetail's title and description editors: "Not saved. Retry").
export const useUpdateTaskMutation = (options?: { silent?: boolean; quietErrors?: boolean }) =>
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
        successMessage: options?.silent ? null : 'Delegation updated',
        errorFallback: "Couldn't save the change to the delegation. Try again.",
        errorToast: !options?.quietErrors,
        // Board and row quick moves (no options) get Retry; field autosaves show their own message.
        retryable: !options?.silent && !options?.quietErrors,
    });

export const useVerifyTaskMutation = () =>
    useEntityMutation({
        mutationFn: ({ id, payload }: { id: string; payload: VerifyTaskPayload }) =>
            taskApi.verify(id, payload),
        setDetailData: (updatedTask) => ({ key: TASK_KEYS.detail(updatedTask.id), data: updatedTask }),
        invalidateKeys: [['tasks']],
        successMessage: (updatedTask) => (updatedTask.status === 'done' ? 'Delegation approved' : 'Delegation sent back'),
        retryable: true,
        errorFallback: "Couldn't save the decision on the delegation. Try again.",
    });

export const useDeleteTaskMutation = () =>
    useEntityMutation({
        mutationFn: (id: string) => taskApi.delete(id),
        removeKey: (_result, id) => TASK_KEYS.detail(id),
        invalidateKeys: [['tasks']],
        successMessage: 'Delegation deleted',
        retryable: true,
        errorFallback: "Couldn't delete the delegation. Try again.",
    });

// The creator throwing away their own unpublished draft (the server allows it for drafts only).
export const useDiscardDraftMutation = () =>
    useEntityMutation({
        mutationFn: (id: string) => taskApi.delete(id),
        removeKey: (_result, id) => TASK_KEYS.detail(id),
        invalidateKeys: [['tasks']],
        successMessage: 'Draft discarded',
        errorFallback: "Couldn't discard the draft. Try again.",
    });

// NEW — powers the "Assign to" dropdown in TaskForm.tsx. Calls the same `/users/assignable`
// endpoint that features/tickets/hook.ts's useAssignableUsersQuery already uses.
export const assignableUsersAllQueryOptions = () => ({
    queryKey: ['assignable-users', 'all'] as const,
    queryFn:  () => userApi.getAssignable().then(r => r.data),
    // The roster changes when an admin edits users, not every half minute.
    staleTime: 5 * 60_000,
});

export const useAssignableUsersQuery = () => {
    const { token } = useAuth();
    return useQuery({
        ...assignableUsersAllQueryOptions(),
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
        onError: (err) => notifyError(err, "Couldn't read that file. Try again."),
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
            invalidateScoreCaches(queryClient);
        },
        onError: (err) => notifyError(err, "Couldn't publish this batch. Try again."),
    });
};

// ── Task checklists (items, images, remarks) ──────────────────────────────
// All of these only ever affect one task's detail view, so they invalidate just that task's
// detail query key — no need to touch the list queries, since checklist progress isn't shown there.

export const useAddTaskChecklistMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (payload: CreateTaskChecklistPayload) => taskChecklistApi.create(taskId, payload).then(r => r.data),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Checklist added',
        errorFallback: "Couldn't add the checklist. Try again.",
    });

export const useDeleteTaskChecklistMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (id: string) => taskChecklistApi.deleteChecklist(id),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Checklist deleted',
        retryable: true,
        errorFallback: "Couldn't delete the checklist. Try again.",
    });

export const useUpdateTaskChecklistItemMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateTaskChecklistItemPayload }) =>
            taskChecklistApi.updateItem(id, payload).then(r => r.data),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        retryable: true,
        errorFallback: "Couldn't update the item. Try again.",
    });

export const useUpdateTaskItemRemarksMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: ({ id, remarks }: { id: string; remarks: string }) =>
            taskChecklistApi.updateRemarks(id, remarks).then(r => r.data),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Remarks saved',
        errorFallback: "Couldn't save the remarks. Try again.",
    });

export const useCompleteTaskChecklistItemMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (id: string) => taskChecklistApi.completeItem(id).then(r => r.data),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Item marked complete',
        retryable: true,
        errorFallback: "Couldn't complete the item. Try again.",
    });

export const useDeleteTaskChecklistItemMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (id: string) => taskChecklistApi.deleteItem(id),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Item deleted',
        retryable: true,
        errorFallback: "Couldn't delete the item. Try again.",
    });

export const useUploadTaskImagesMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: ({ itemId, files, captureMethod }: { itemId: string; files: File[]; captureMethod: CaptureMethod }) =>
            taskChecklistApi.uploadImages(itemId, files, captureMethod).then(r => r.data),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Photos uploaded',
        errorFallback: "Couldn't upload the photos. Try again.",
    });

export const useDeleteTaskImageMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (id: string) => taskChecklistApi.deleteImage(id),
        invalidateKeys: [TASK_KEYS.detail(taskId)],
        successMessage: 'Photo deleted',
        retryable: true,
        errorFallback: "Couldn't delete the photo. Try again.",
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
        errorFallback: "Couldn't apply the template. Try again.",
    });

export const useCreateSmartTaskMutation = () => 
    useEntityMutation({
        mutationFn : (payload : ConfirmSmartTaskPayload) => taskApi.createFromSmart(payload),
        invalidateKeys : [["tasks"]], 
        successMessage : "Delegation created",
        errorFallback : "Couldn't create the delegation. Try again."
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
// Files on the delegation itself (added when it was created or later). The server lets the
// creator, the assignees and an Admin/PC add or remove them.
export const useUploadTaskAttachmentsMutation = (taskId: string) =>
    useEntityMutation({
        mutationFn: (files: File[]) => taskApi.uploadAttachments(taskId, files),
        invalidateKeys: [['tasks']],
        successMessage: null,
        errorFallback: "Couldn't add the file. Try again.",
    });

export const useDeleteTaskAttachmentMutation = () =>
    useEntityMutation({
        mutationFn: (id: string) => taskApi.deleteAttachment(id),
        invalidateKeys: [['tasks']],
        successMessage: null,
        retryable: true,
        errorFallback: "Couldn't remove the file. Try again.",
    });
