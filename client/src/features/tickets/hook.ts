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

// No toasts of its own: the New ticket form says "Ticket created" itself once any photos have
// uploaded too (with an Open action), and shows a failure next to its Create button.
export const useCreateTicketMutation = () =>
  useEntityMutation({
    mutationFn: (payload: CreateTicketPayload) => ticketApi.create(payload).then(r => r.data),
    invalidateKeys: [['tickets']],
    successMessage: null,
    errorFallback: "Couldn't create the ticket. Check your connection and try again.",
    errorToast: false,
  });

// `silent: true` drops the success toast — for edits whose result is already visible on screen
// (a label chip appearing), same as useUpdateTaskMutation's option.
// `inlineError: true` drops the error toast, for a caller that shows the failure next to its own
// Save button (the edit form), so the same message doesn't appear twice.
export const useUpdateTicketMutation = (options?: { silent?: boolean; inlineError?: boolean }) =>
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
    errorFallback: "Couldn't save the ticket. Try again.",
    errorToast: !options?.inlineError,
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
    errorFallback: "Couldn't change the status. Try again.",
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
    errorFallback: "Couldn't change the status. Try again.",
  });

// The server's largest page. Lists that filter client-side read every page of this size.
export const BOARD_LIMIT = 500;
// A safety stop so a runaway total can't loop for ever: 10 pages is 5,000 tickets.
const MAX_PAGES = 10;
/** The most tickets a "load everything" list will ever hold. Reaching it means some were left out. */
export const BOARD_MAX_TICKETS = BOARD_LIMIT * MAX_PAGES;

// Reads page 1, then every remaining page at once (same idea as features/team/useTeamWork.ts), so
// counts and client-side filters see the whole set instead of the newest 500. `total` is the
// server's own count, which stays right even if the safety stop was hit. Shaped `{ data }` so the
// optimistic patcher (patchEntityInCache) reaches these rows too.
const fetchAllTickets = async (status?: TicketStatus, assigneeId?: string): Promise<{ data: Ticket[]; total: number }> => {
  const first = await ticketApi.getAll(1, BOARD_LIMIT, status, assigneeId);
  const pages = Math.min(first.meta?.totalPages ?? 1, MAX_PAGES);
  const rest = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => ticketApi.getAll(i + 2, BOARD_LIMIT, status, assigneeId)))
    : [];
  // Newest first across pages; a ticket raised between two page reads can shift one row onto the
  // next page, so drop the repeat rather than show it twice.
  const byId = new Map<string, Ticket>();
  for (const page of [first, ...rest]) for (const t of page.data) if (!byId.has(t.id)) byId.set(t.id, t);
  const data = [...byId.values()];
  return { data, total: first.meta?.total ?? data.length };
};

// Powers the verification queue: every ticket waiting on a given status (PENDING_APPROVAL), scoped
// server-side to whatever the requester is allowed to see. All pages, so nothing past the first
// page drops out of the queue or its counts.
export const useTicketsByStatusQuery = (status: TicketStatus, enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['tickets', 'by-status', status],
    queryFn: () => fetchAllTickets(status),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
  });
};

// Every ticket the viewer can see, so search/filter/sort and the stat tiles run against the whole
// matching set. Used by both the Board view (always needed all-at-once to bucket into columns)
// and the List view (which paginates the *filtered* result client-side — see TicketList.tsx).
// Shared with routePrefetch so a hover-prefetch and the page's own query hit the same cache entry.
// useTicketSocket is mounted app-wide and invalidates ['tickets'] on every ticket event, so a
// longer staleTime only skips the refetch-on-revisit, it can't leave stale rows on screen.
export const ticketsBoardQueryOptions = (assigneeId?: string) => ({
  queryKey: ['tickets', 'board', assigneeId] as const,
  queryFn: () => fetchAllTickets(undefined, assigneeId).then((r) => r.data),
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
    successMessage: (updated) => (updated.status === 'CLOSED' ? 'Ticket approved and closed' : 'Ticket sent back'),
    errorFallback: "Couldn't save the decision. Try again.",
  });

// `withdraw` is the raiser taking back their own unstarted ticket: same request, their own wording.
export const useDeleteTicketMutation = (options?: { withdraw?: boolean }) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.delete(id),
    invalidateKeys: [['tickets']],
    successMessage: options?.withdraw ? 'Ticket withdrawn' : 'Ticket deleted',
    errorFallback: options?.withdraw ? "Couldn't withdraw the ticket" : "Couldn't delete the ticket",
  });

export const useAddChecklistMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (payload: CreateChecklistPayload) => ticketApi.addChecklist(ticketId, payload).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId), ['tickets']],
    successMessage: 'Checklist added',
    errorFallback: "Couldn't add checklist. Try again.",
  });

export const useDeleteChecklistMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteChecklist(id),
    invalidateKeys: [KEYS.detail(ticketId), ['tickets']],
    successMessage: 'Checklist deleted',
    errorFallback: "Couldn't delete checklist. Try again.",
  });

export const useUpdateChecklistItemMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateChecklistItemPayload }) =>
      ticketApi.updateChecklistItem(id, payload).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId), ['tickets']],
    errorFallback: "Couldn't update item. Try again.",
  });

export const useDeleteChecklistItemMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteChecklistItem(id),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Item deleted',
    errorFallback: "Couldn't delete item. Try again.",
  });

export const useUpdateChecklistItemRemarksMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks: string }) =>
      ticketApi.updateChecklistItemRemarks(id, remarks).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Remarks saved',
    errorFallback: "Couldn't save remarks. Try again.",
  });

export const useCompleteChecklistItemMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.completeChecklistItem(id).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Item marked complete',
    errorFallback: "Couldn't complete item. Try again.",
  });

export const useUploadChecklistImagesMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: ({ itemId, files, captureMethod }: { itemId: string; files: File[]; captureMethod: 'LIVE' | 'GALLERY' }) =>
      ticketApi.uploadChecklistImages(itemId, files, captureMethod).then(r => r.data),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Photos uploaded',
    errorFallback: "Couldn't upload photos. Try again.",
  });

export const useDeleteChecklistImageMutation = (ticketId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => ticketApi.deleteChecklistImage(id),
    invalidateKeys: [KEYS.detail(ticketId)],
    successMessage: 'Photo deleted',
    errorFallback: "Couldn't delete photo. Try again.",
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
    errorFallback: "Couldn't apply template. Try again.",
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
    onError: (err) => toast.error(errorMessage(err, "Couldn't read that file")),
  });

export const useTicketBulkImportPublishMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TicketBulkImportPublishPayload) => ticketBulkImportApi.publish(payload).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't publish this batch")),
  });
};

// Photos on the ticket itself (added at creation or later), separate from the proof photos that
// travel with a status change. The server lets anyone who may edit the ticket add or remove them.
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
    errorFallback: "Couldn't remove the photo. Try again.",
  });
