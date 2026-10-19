import { useCallback, useRef } from "react";
import { useQuery , useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { activityQueryOptions } from "../../components/activityTimeline/activityQuery";
import { useAuth } from "../../context/AuthContext";
import { taskApi } from "../../api/task";
import { userApi } from "../../api/users";
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
    all: (userId?: string, tagIds?: string[]) =>
        ['tasks', userId ?? 'mine', [...(tagIds ?? [])].sort().join(',')] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
    drafts: ['tasks', 'draft'] as const,
    archived: ['tasks', 'archived'] as const,
};

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
        select: (page) => page.data,
        enabled:  !!token && enabled,
        retry: handleQueryRetry,
        placeholderData: keepPreviousData,
        ...options,
    });
};

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
        invalidateKeys: [['tasks']],
        successMessage: 'Delegation restored',
        retryable: true,
        errorFallback: "Couldn't restore the delegation. Try again.",
    });

export const usePublishDraftTaskMutation = () =>
    useEntityMutation({
        mutationFn: (id: string) => taskApi.update(id, { status: 'todo', statusRemark: PUBLISH_REMARK }),
        invalidateKeys: [['tasks']],
        successMessage: 'Delegation published',
        retryable: true,
        errorFallback: "Couldn't publish the delegation. Try again.",
    });

export const taskDetailQueryOptions = (id: string) => ({
    queryKey: TASK_KEYS.detail(id),
    queryFn:  () => taskApi.getOne(id),
});

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
        successMessage: null,
        errorFallback: "Couldn't create the delegation. Try again.",
        errorToast: false,
    });

export const useUpdateTaskMutation = (options?: { silent?: boolean; quietErrors?: boolean }) =>
    useEntityMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateTaskPayload }) =>
            taskApi.update(id, payload),
        setDetailData: (updatedTask) => ({ key: TASK_KEYS.detail(updatedTask.id), data: updatedTask }),
        invalidateKeys: [['tasks']],
        optimisticUpdate: {
            keyPrefixes: [['tasks']],
            apply: ({ id, payload }) => (old) => patchEntityInCache<Task>(old, id, payload),
        },
        successMessage: options?.silent ? null : 'Delegation updated',
        errorFallback: "Couldn't save the change to the delegation. Try again.",
        errorToast: !options?.quietErrors,
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

export const useDiscardDraftMutation = () =>
    useEntityMutation({
        mutationFn: (id: string) => taskApi.delete(id),
        removeKey: (_result, id) => TASK_KEYS.detail(id),
        invalidateKeys: [['tasks']],
        successMessage: 'Draft discarded',
        errorFallback: "Couldn't discard the draft. Try again.",
    });

export const assignableUsersAllQueryOptions = () => ({
    queryKey: ['assignable-users', 'all'] as const,
    queryFn:  () => userApi.getAssignable().then(r => r.data),
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

export const useTaskBulkImportPreviewMutation = () =>
    useMutation({
        mutationFn: (file: File) => taskBulkImportApi.preview(file).then(r => r.data),
        onError: (err) => notifyError(err, "Couldn't read that file. Try again."),
    });

export const useTaskBulkImportPublishMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: TaskBulkImportPublishPayload) => taskBulkImportApi.publish(payload).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['analytics'] });
            invalidateScoreCaches(queryClient);
        },
        onError: (err) => notifyError(err, "Couldn't publish this batch. Try again."),
    });
};

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

const SMART_TASK_CONVERSATION_KEYS = {
    all:    ['smart-task-conversations'] as const,
    detail: (id: string) => ['smart-task-conversations', id] as const,
};

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
