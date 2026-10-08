import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { activityQueryOptions } from '../../components/activityTimeline/activityQuery';
import { useAuth } from '../../context/AuthContext';
import { ticketApi } from '../../api/ticket';
import { ticketBulkImportApi } from '../../api/ticketBulkImport';
import type { TicketBulkImportPublishPayload } from '../../api/ticketBulkImport';
import type {
  Ticket,
  CreateTicketPayload,
  UpdateTicketPayload,
  VerifyTicketPayload,
  CreateChecklistPayload,
  UpdateChecklistItemPayload,
  TatReportGroupBy,
  TicketStatus,
  RestrictedStatus,
  CaptureMethod,
} from '../../api/ticket';
import { userApi } from "../../api/users";
import { departmentApi } from "../../api/departments";
import { storeApi } from "../../api/stores";
import { checklistTemplateApi } from "../../api/checklistTemplates";
import { handleQueryRetry, useEntityMutation, patchEntityInCache, errorMessage } from '../../lib/queryHelpers';
import type { SummaryScope } from '../../api/http';
import type { DashboardQueryOptions } from '../../lib/dashboardQuery';

const KEYS = {
  // `limit` belongs in the key. Without it `useTicketsQuery(1, 100)` (the dashboard/analytics
  // callers) and the default `useTicketsQuery(1, 20)` resolved to the same cache entry, so
  // whichever mounted first decided how many rows every other consumer got back — the second
  // one read a cached page of the wrong size and never refetched.
  all: (page: number, limit: number, assigneeId?: string) => ['tickets', page, limit, assigneeId] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
};

// `enabled` lets a caller (e.g. the header's quick search) defer the fetch until it's actually
// needed, instead of every mount pulling a page of tickets regardless of whether it's used yet.
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

// Server-side ticket counts (ticket.service.ts#summary), not a client-side reduce over
// useTicketsQuery's own capped page, and one that doesn't require pulling the whole list just to
// count it. `scope` picks the slice: 'mine' (raised by or assigned to me, the sidebar badge's
// default) or 'visible' (everything this role can see). Scope is part of the key.
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

// Dashboard's "Needs your approval" card — `enabled` is the caller's own role check (ADMIN/PC
// only), same convention as useTicketSummaryQuery's own `enabled` param. Returns the oldest few
// rows plus the real queue size.
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

// Warms a ticket's full record and its activity before the card is clicked. The list rows carry
// no status history, so without this the open sheet starts both fetches only after it mounts.
// Returns the handlers to spread on the card. A mouse waits 150ms on the card first, so sweeping
// across a board doesn't fire two requests for every card on the way; a finger or keyboard focus
// is a clear intent and goes at once.
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
    successMessage: 'Ticket created',
    errorFallback: 'Failed to create ticket',
  });

// `silent: true` drops the success toast — for edits whose result is already visible on screen
// (a label chip appearing), same as useUpdateTaskMutation's option.
export const useUpdateTicketMutation = (options?: { silent?: boolean }) =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTicketPayload }) =>
      ticketApi.update(id, payload).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets']],
    // Drag-drop status moves on the board should feel instant, not snap back to the old column
    // until the PATCH round-trips — patch every cached ticket list/board/detail immediately.
    optimisticUpdate: {
      keyPrefixes: [['tickets']],
      apply: ({ id, payload }) => (old) => patchEntityInCache<Ticket>(old, id, payload),
    },
    successMessage: options?.silent ? null : 'Ticket updated',
    errorFallback: 'Failed to update ticket',
  });

// The restricted status-update flow: a non-verifier moves a ticket to In Progress/On Hold/In
// Review with a mandatory remark and optional live/gallery evidence photos, bundled into one
// request — mirrors useVerifyTicketMutation's shape (also writes straight to the detail cache).
export const useAddTicketStatusUpdateMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (payload: { status: RestrictedStatus; remark?: string; captureMethod?: CaptureMethod; files?: File[] }) =>
      ticketApi.addStatusUpdate(ticketId, payload).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets']],
    successMessage: 'Status updated',
    errorFallback: 'Failed to update status',
  });

// Same endpoint as useAddTicketStatusUpdateMutation, but the ticket id travels in the payload
// rather than being bound when the hook is created — the board moves whichever card was dragged,
// so it can't name the ticket up front the way the detail sheet can.
export const useTicketStatusMoveMutation = () =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status: RestrictedStatus; remark?: string } }) =>
      ticketApi.addStatusUpdate(id, payload).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets']],
    successMessage: 'Status updated',
    errorFallback: 'Failed to update status',
  });

// Powers the PC verification queue — tickets waiting on a given status (PENDING_APPROVAL), scoped
// server-side to whatever the requester is allowed to see (PC/ADMIN get their whole department).
export const useTicketsByStatusQuery = (status: TicketStatus, limit = 100, enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['tickets', 'by-status', status],
    queryFn: () => ticketApi.getAll(1, limit, status).then(r => r.data),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
  });
};

// Powers the Tickets Board view — unlike the list view's 20-per-page pagination, a board needs
// to see effectively all tickets at once to bucket them correctly into status columns. Known v1
// limitation: more than BOARD_LIMIT open tickets means the board undercounts rather than
// paginating further — acceptable for now, a one-line constant bump if it becomes a real issue.
export const BOARD_LIMIT = 500;

// Fetches (up to BOARD_LIMIT) tickets unpaginated, so search/filter/sort can run against the
// whole matching set instead of just whatever 20-row page the server-paginated list happens to
// be showing. Used by both the Board view (always needed all-at-once to bucket into columns)
// and the List view (which paginates the *filtered* result client-side — see TicketList.tsx).
// Shared with routePrefetch so a hover-prefetch and the page's own query hit the same cache entry.
// useTicketSocket is mounted app-wide and invalidates ['tickets'] on every ticket event, so a
// longer staleTime only skips the refetch-on-revisit, it can't leave stale rows on screen.
export const ticketsBoardQueryOptions = (assigneeId?: string) => ({
  queryKey: ['tickets', 'board', assigneeId] as const,
  queryFn: () => ticketApi.getAll(1, BOARD_LIMIT, undefined, assigneeId).then(r => r.data),
  staleTime: 2 * 60_000,
});

export const useTicketsBoardQuery = (enabled = true, assigneeId?: string) => {
  const { token } = useAuth();
  return useQuery({
    ...ticketsBoardQueryOptions(assigneeId),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    // Switching the assignee filter keeps the current rows up instead of dropping to a skeleton.
    placeholderData: keepPreviousData,
  });
};

export const useVerifyTicketMutation = () =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: VerifyTicketPayload }) =>
      ticketApi.verify(id, payload).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.detail(updated.id), data: updated }),
    invalidateKeys: [['tickets']],
    successMessage: (updated) => (updated.status === 'CLOSED' ? 'Ticket verified and closed' : 'Ticket sent back'),
    errorFallback: 'Failed to verify ticket',
  });

export const useDeleteTicketMutation = () =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.delete(id),
    invalidateKeys: [['tickets']],
    successMessage: 'Ticket deleted',
    errorFallback: 'Failed to delete ticket',
  });

export const useAddChecklistMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (payload: CreateChecklistPayload) => ticketApi.addChecklist(ticketId, payload).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId), ['tickets']],
    successMessage: 'Checklist added',
    errorFallback: 'Failed to add checklist',
  });

export const useDeleteChecklistMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteChecklist(id),
    invalidateKeys: [KEYS.detail(ticketId), ['tickets']],
    successMessage: 'Checklist deleted',
    errorFallback: 'Failed to delete checklist',
  });

export const useUpdateChecklistItemMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateChecklistItemPayload }) =>
      ticketApi.updateChecklistItem(id, payload).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId), ['tickets']],
    errorFallback: 'Failed to update item',
  });

export const useDeleteChecklistItemMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteChecklistItem(id),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Item deleted',
    errorFallback: 'Failed to delete item',
  });

export const useUpdateChecklistItemRemarksMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks: string }) =>
      ticketApi.updateChecklistItemRemarks(id, remarks).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Remarks saved',
    errorFallback: 'Failed to save remarks',
  });

export const useCompleteChecklistItemMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.completeChecklistItem(id).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Item marked complete',
    errorFallback: 'Failed to complete item',
  });

export const useUploadChecklistImagesMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: ({ itemId, files, captureMethod }: { itemId: string; files: File[]; captureMethod: 'LIVE' | 'GALLERY' }) =>
      ticketApi.uploadChecklistImages(itemId, files, captureMethod).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Photos uploaded',
    errorFallback: 'Failed to upload photos',
  });

export const useDeleteChecklistImageMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteChecklistImage(id),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Photo deleted',
    errorFallback: 'Failed to delete photo',
  });


// Reusable checklist templates (managed under Admin) that can be applied to a ticket in one
// click instead of typing the same checklist out by hand — see features/admin/ChecklistTemplateList.tsx.
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
    errorFallback: 'Failed to apply template',
  });

// Org structure (who's assignable, which departments/stores exist) changes on the order of "an
// admin edits it occasionally," not "every 30 seconds" — the app-wide default staleTime exists to
// stop instant refetch-on-remount for data that's seconds old, but these queries get remounted
// constantly (every filter dropdown, every form) and re-fetching the same org chart each time is
// pure waste. 5 minutes still refreshes well within a session; any admin edit invalidates these
// keys directly anyway (see admin/hook.ts's department/store mutations), so this never shows
// stale data after an actual change — it only skips redundant fetches of unchanged data.
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

export const useTatReportQuery = (groupBy: TatReportGroupBy, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ["tickets", "tat-report", groupBy, from, to],
    queryFn: () => ticketApi.getTatReport(groupBy, from, to).then(r => r.data),
    enabled: !!token && (user?.role === "ADMIN" || user?.role === "PC"),
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

// ── Bulk import (CSV/Excel → many tickets) ──────────────────────────────
// Same split as Delegation's own two hooks: preview only reads and matches, so it invalidates
// nothing; publish is the one step that actually creates tickets.
export const useTicketBulkImportPreviewMutation = () =>
  useMutation({
    mutationFn: (file: File) => ticketBulkImportApi.preview(file).then(r => r.data),
    onError: (err) => toast.error(errorMessage(err, 'Failed to read that file')),
  });

export const useTicketBulkImportPublishMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TicketBulkImportPublishPayload) => ticketBulkImportApi.publish(payload).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to publish this batch')),
  });
};

// Photos on the ticket itself (added at creation or later), separate from the proof photos that
// travel with a status change. The server lets anyone who may edit the ticket add or remove them.
export const useUploadTicketAttachmentsMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (files: File[]) => ticketApi.uploadAttachments(ticketId, files),
    invalidateKeys: [['tickets']],
    successMessage: null,
    errorFallback: 'Failed to add the photo',
  });

export const useDeleteTicketAttachmentMutation = () =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteAttachment(id),
    invalidateKeys: [['tickets']],
    successMessage: null,
    errorFallback: 'Failed to remove the photo',
  });
