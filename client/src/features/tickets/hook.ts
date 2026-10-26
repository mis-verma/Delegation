import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { activityQueryOptions } from '../../components/activityTimeline/activityQuery';
import { useAuth } from '../../context/AuthContext';
import { ticketApi, type TicketListQuery } from '../../api/ticket';
import { ticketBulkImportApi } from '../../api/ticketBulkImport';
import type { TicketBulkImportPublishPayload } from '../../api/ticketBulkImport';
import type {
  Ticket,
  CreateTicketPayload,
  UpdateTicketPayload,
  VerifyTicketPayload,
  CreateChecklistPayload,
  UpdateChecklistItemPayload,
  TicketStatus,
  RestrictedStatus,
  CaptureMethod,
} from '../../api/ticket';
import { userApi } from "../../api/users";
import { departmentApi } from "../../api/departments";
import { storeApi } from "../../api/stores";
import { checklistTemplateApi } from "../../api/checklistTemplates";
import { handleQueryRetry, useEntityMutation, patchEntityInCache, notifyError, invalidateScoreCaches } from '../../lib/queryHelpers';
import type { SummaryScope } from '../../api/http';
import type { DashboardQueryOptions } from '../../lib/dashboardQuery';

const KEYS = {
  all: (page: number, limit: number, assigneeId?: string) => ['tickets', page, limit, assigneeId] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
};

export const useTicketsQuery = (page = 1, limit = 20, assigneeId?: string, enabled = true, options?: DashboardQueryOptions) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: KEYS.all(page, limit, assigneeId),
    queryFn: () => ticketApi.getAll(page, limit, undefined, assigneeId),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    ...options,
  });
};

export const useTicketSummaryQuery = (scope: SummaryScope = 'mine', enabled = true, options?: DashboardQueryOptions) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['tickets', 'summary', scope] as const,
    queryFn: () => ticketApi.getSummary(scope),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    ...options,
  });
};

export const useTicketPendingApprovalQuery = (enabled = true, options?: DashboardQueryOptions) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['tickets', 'pending-approval'] as const,
    queryFn: () => ticketApi.getPendingApproval(),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    ...options,
  });
};

export const ticketDetailQueryOptions = (id: string) => ({
  queryKey: KEYS.detail(id),
  queryFn: () => ticketApi.getOne(id).then(r => r.data),
});

export const usePrefetchTicket = (id: string) => {
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = useCallback(() => {
    if (!token) return;
    void queryClient.prefetchQuery({ ...ticketDetailQueryOptions(id), staleTime: 30_000 });
    void queryClient.prefetchQuery(activityQueryOptions('Ticket', id));
  }, [queryClient, token, id]);
  const cancel = useCallback(() => clearTimeout(timer.current), []);

  return {
    onMouseEnter: () => { cancel(); timer.current = setTimeout(run, 150); },
    onMouseLeave: cancel,
    onFocus: run,
    onTouchStart: run,
  };
};

export const useTicketQuery = (id: string) => {
  const { token } = useAuth();
  return useQuery({
    ...ticketDetailQueryOptions(id),
    enabled: !!token && !!id,
    retry: handleQueryRetry,
  });
};

export const useCreateTicketMutation = () =>
  useEntityMutation({
    mutationFn: (payload: CreateTicketPayload) => ticketApi.create(payload).then(r => r.data),
    invalidateKeys: [['tickets']],
    successMessage: null,
    errorFallback: "Couldn't create the ticket. Try again.",
    errorToast: false,
  });

export const useUpdateTicketMutation = (options?: { silent?: boolean; inlineError?: boolean }) =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTicketPayload }) =>
      ticketApi.update(id, payload).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets']],
    optimisticUpdate: {
      keyPrefixes: [['tickets']],
      apply: ({ id, payload }) => (old) => patchEntityInCache<Ticket>(old, id, payload),
    },
    successMessage: options?.silent ? null : 'Ticket updated',
    errorFallback: "Couldn't save the ticket. Try again.",
    errorToast: !options?.inlineError,
  });

export const useAddTicketStatusUpdateMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (payload: { status: RestrictedStatus; remark?: string; captureMethod?: CaptureMethod; files?: File[] }) =>
      ticketApi.addStatusUpdate(ticketId, payload).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets']],
    successMessage: 'Status updated',
    retryable: true,
    errorFallback: "Couldn't change the status of the ticket. Try again.",
  });

export const useTicketProgressMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (payload: { remark: string; captureMethod?: CaptureMethod; files?: File[] }) =>
      ticketApi.addStatusUpdate(ticketId, { status: 'IN_PROGRESS', ...payload }).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets']],
    successMessage: 'Update posted. The person who raised it can see it.',
    retryable: true,
    errorFallback: "Couldn't post the update. Try again.",
  });

export const useTicketStatusMoveMutation = () =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status: RestrictedStatus; remark?: string } }) =>
      ticketApi.addStatusUpdate(id, payload).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets']],
    successMessage: 'Status updated',
    retryable: true,
    errorFallback: "Couldn't change the status of the ticket. Try again.",
  });

const BOARD_LIMIT = 500;
const MAX_PAGES = 10;
export const BOARD_MAX_TICKETS = BOARD_LIMIT * MAX_PAGES;

const fetchAllTickets = async (status?: TicketStatus, assigneeId?: string): Promise<{ data: Ticket[]; total: number }> => {
  const first = await ticketApi.getAll(1, BOARD_LIMIT, status, assigneeId);
  const pages = Math.min(first.meta?.totalPages ?? 1, MAX_PAGES);
  const rest = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => ticketApi.getAll(i + 2, BOARD_LIMIT, status, assigneeId)))
    : [];
  const byId = new Map<string, Ticket>();
  for (const page of [first, ...rest]) for (const t of page.data) if (!byId.has(t.id)) byId.set(t.id, t);
  const data = [...byId.values()];
  return { data, total: first.meta?.total ?? data.length };
};

export const useTicketsByStatusQuery = (status: TicketStatus, enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['tickets', 'by-status', status],
    queryFn: () => fetchAllTickets(status),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
  });
};

export const ticketsBoardQueryOptions = (assigneeId?: string) => ({
  queryKey: ['tickets', 'board', assigneeId] as const,
  queryFn: () => fetchAllTickets(undefined, assigneeId).then((r) => r.data),
  staleTime: 2 * 60_000,
});

export const TICKET_PAGE_SIZE = 20;

export type PagedTicketQuery = Omit<TicketListQuery, "limit">;

export const useTicketsPagedQuery = (query: PagedTicketQuery, enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['tickets', 'paged', query] as const,
    queryFn: () => ticketApi.getPage({ ...query, limit: TICKET_PAGE_SIZE }),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
};

export const useTicketsBoardQuery = (enabled = true, assigneeId?: string) => {
  const { token } = useAuth();
  return useQuery({
    ...ticketsBoardQueryOptions(assigneeId),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
  });
};

export const useTicketsAwaitingHeadQuery = (enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['tickets', 'awaiting-head'] as const,
    queryFn: () => ticketApi.awaitingHead(),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    staleTime: 30_000,
  });
};

export const useApproveAssignmentMutation = () =>
  useEntityMutation({
    mutationFn: ({ id }: { id: string }) => ticketApi.approveAssignment(id).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets']],
    successMessage: 'Approved. The team can start work now.',
    retryable: true,
    errorFallback: "Couldn't approve the ticket. Try again.",
  });

export const useReopenDeclinedMutation = () =>
  useEntityMutation({
    mutationFn: ({ id }: { id: string }) => ticketApi.reopenDeclined(id).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets'], ['scores']],
    successMessage: 'Ticket reopened. The team has been told.',
    retryable: true,
    errorFallback: "Couldn't reopen the ticket. Try again.",
  });

export const useDeclineTicketMutation = () =>
  useEntityMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => ticketApi.decline(id, reason).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets'], ['scores']],
    successMessage: 'Ticket declined. The person who raised it has been told.',
    successHaptic: 'warning',
    retryable: true,
    errorFallback: "Couldn't decline the ticket. Try again.",
  });

export const useVerifyTicketMutation = () =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: VerifyTicketPayload }) =>
      ticketApi.verify(id, payload).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets']],
    successMessage: (updated) => (updated.status === 'CLOSED' ? 'Ticket approved and closed' : 'Ticket sent back'),
    retryable: true,
    errorFallback: "Couldn't save the decision on the ticket. Try again.",
  });

export const useDeleteTicketMutation = (options?: { withdraw?: boolean }) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.delete(id),
    invalidateKeys: [['tickets']],
    successMessage: options?.withdraw ? 'Ticket withdrawn' : 'Ticket deleted',
    errorFallback: options?.withdraw ? "Couldn't withdraw the ticket. Try again." : "Couldn't delete the ticket. Try again.",
  });

export const useAddChecklistMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (payload: CreateChecklistPayload) => ticketApi.addChecklist(ticketId, payload).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId), ['tickets']],
    successMessage: 'Checklist added',
    errorFallback: "Couldn't add the checklist. Try again.",
  });

export const useDeleteChecklistMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteChecklist(id),
    invalidateKeys: [KEYS.detail(ticketId), ['tickets']],
    successMessage: 'Checklist deleted',
    retryable: true,
    errorFallback: "Couldn't delete the checklist. Try again.",
  });

export const useUpdateChecklistItemMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateChecklistItemPayload }) =>
      ticketApi.updateChecklistItem(id, payload).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId), ['tickets']],
    retryable: true,
    errorFallback: "Couldn't update the item. Try again.",
  });

export const useDeleteChecklistItemMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteChecklistItem(id),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Item deleted',
    retryable: true,
    errorFallback: "Couldn't delete the item. Try again.",
  });

export const useUpdateChecklistItemRemarksMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks: string }) =>
      ticketApi.updateChecklistItemRemarks(id, remarks).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Remarks saved',
    errorFallback: "Couldn't save the remarks. Try again.",
  });

export const useCompleteChecklistItemMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.completeChecklistItem(id).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Item marked complete',
    retryable: true,
    errorFallback: "Couldn't complete the item. Try again.",
  });

export const useUploadChecklistImagesMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: ({ itemId, files, captureMethod }: { itemId: string; files: File[]; captureMethod: 'LIVE' | 'GALLERY' }) =>
      ticketApi.uploadChecklistImages(itemId, files, captureMethod).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Photos uploaded',
    errorFallback: "Couldn't upload the photos. Try again.",
  });

export const useDeleteChecklistImageMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteChecklistImage(id),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Photo deleted',
    retryable: true,
    errorFallback: "Couldn't delete the photo. Try again.",
  });

export const useChecklistTemplatesQuery = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-templates', 'TICKET'],
    queryFn: () => checklistTemplateApi.getAll('TICKET').then(r => r.data),
    enabled: !!token,
    retry: handleQueryRetry,
  });
};

export const useApplyChecklistTemplateMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (templateId: string) => checklistTemplateApi.applyToTicket(ticketId, templateId),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Template applied',
    errorFallback: "Couldn't apply the template. Try again.",
  });

const ORG_STRUCTURE_STALE_TIME = 5 * 60_000;

export const assignableUsersQueryOptions = (departmentId?: string, storeId?: string, storeIds?: string[]) => ({
  queryKey: ['assignable-users', departmentId ?? 'all', storeId ?? 'all', storeIds?.length ? [...storeIds].sort() : 'all'],
  queryFn: () => userApi.getAssignable(departmentId, storeId, storeIds).then(r => r.data),
  staleTime: ORG_STRUCTURE_STALE_TIME,
});

export const useAssignableUsersQuery = (departmentId?: string, storeId?: string, storeIds?: string[], enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    ...assignableUsersQueryOptions(departmentId, storeId, storeIds),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
  });
};

const DEPARTMENT_KEY = {
  all: ["departments"] as const,
};

export const departmentsQueryOptions = () => ({
  queryKey: DEPARTMENT_KEY.all,
  queryFn: () => departmentApi.getAll().then(r => r.data),
  staleTime: ORG_STRUCTURE_STALE_TIME,
});

export const useDepartmentsQuery = (enabled: boolean = true) => {
  const { token } = useAuth();
  return useQuery({
    ...departmentsQueryOptions(),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
  });
};

export const storesQueryOptions = () => ({
  queryKey: ['stores'] as const,
  queryFn: () => storeApi.getAll().then(r => r.data),
  staleTime: ORG_STRUCTURE_STALE_TIME,
});

export const useStoresQuery = (enabled: boolean = true) => {
  const { token } = useAuth();
  return useQuery({
    ...storesQueryOptions(),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
  });
};

export const useTicketBulkImportPreviewMutation = () =>
  useMutation({
    mutationFn: (file: File) => ticketBulkImportApi.preview(file).then(r => r.data),
    onError: (err) => notifyError(err, "Couldn't read that file. Try again."),
  });

export const useTicketBulkImportPublishMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TicketBulkImportPublishPayload) => ticketBulkImportApi.publish(payload).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      invalidateScoreCaches(queryClient);
    },
    onError: (err) => notifyError(err, "Couldn't publish this batch. Try again."),
  });
};

export const useUploadTicketAttachmentsMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (files: File[]) => ticketApi.uploadAttachments(ticketId, files),
    invalidateKeys: [['tickets']],
    successMessage: null,
    errorFallback: "Couldn't add the photo. Try again.",
  });

export const useDeleteTicketAttachmentMutation = () =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteAttachment(id),
    invalidateKeys: [['tickets']],
    successMessage: null,
    retryable: true,
    errorFallback: "Couldn't remove the photo. Try again.",
  });
