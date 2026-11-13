import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useConfirm } from '../../components';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useTicketsByStatusQuery } from '../tickets/hook';
import { useAuth } from '../../context/AuthContext';
import { canApproveTicket, taskApprovalSubject } from '../../lib/ticketApproval';
import { usePendingTasksQuery } from './usePendingTasksQuery';
import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';
import type { ChecklistInstance } from '../../api/checklistInstances';
import { ChecklistList } from './ChecklistList';
import { DecidedToday } from './DecidedToday';
import { QueueToolbar } from './QueueToolbar';
import { QueueSections } from './QueueSections';
import { SectionTitle } from './SectionTitle';
import { summarize, taskWaitingSince, ticketWaitingSince } from './sectionStats';
import { ReviewPane, type SendBackPayload } from './ReviewPane';
import { ShortcutsHelp } from './ShortcutsHelp';
import { TicketTaskQueue } from './TicketTaskQueue';
import { approveRun, rejectRun, sendBackRun } from './decisionRequests';
import { filterTasks, filterTickets, sortByWaiting, type TicketTaskFilter } from './ticketTaskFilters';
import { useChecklistDecisionsQuery } from './useChecklistDecisions';
import {
  useChecklistQueueQuery, useChecklistRows, useNow, useQueueLookups, useVisibleChecklistRows,
} from './useChecklistQueue';
import { useDeferredDecisions } from './useDeferredDecisions';
import { useQueueParams, type QueueParamsPatch } from './useQueueParams';
import { useQueueShortcuts } from './useQueueShortcuts';
import { useRefreshAfterDecision } from './useRefreshAfterDecision';
import { useReviewDraft, type ReviewDraft } from './useReviewDraft';
import { DAY_MS, UNASSIGNED, type ChecklistRow } from './verificationModel';

const NO_TICKETS: Ticket[] = [];
const NO_TASKS: Task[] = [];
const AUTO_LOAD_PAGES = 10;
const BULK_PARALLEL = 4;
const BACK_BUTTON = 'inline-flex h-11 items-center gap-1.5 rounded-full border border-border/60 bg-surface px-3.5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 ease-out cursor-pointer hover:border-border-hover hover:text-text active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:h-9';
const NO_INSTANCES: ChecklistInstance[] = [];

const focusRow = (id: string | null) => {
  if (!id) return;
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-queue-row="${CSS.escape(id)}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  });
};

interface Latest {
  rows: ChecklistRow[];
  activeId: string | null;
  openId: string | null;
  isDesktop: boolean;
  draft: ReviewDraft | null;
  patch: (change: QueueParamsPatch, options?: { replace?: boolean }) => void;
}

export const VerificationQueue = () => {
  const { params, patch, searchParams } = useQueueParams();
  const now = useNow();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const confirm = useConfirm();

  const { user: viewer } = useAuth();
  const ticketsQuery = useTicketsByStatusQuery('PENDING_APPROVAL');
  const tasksQuery = usePendingTasksQuery('pending_approval');
  const allTickets = ticketsQuery.data?.data ?? NO_TICKETS;
  const tickets = useMemo(() => allTickets.filter((t) => canApproveTicket(viewer, t)), [allTickets, viewer]);
  const allTasks = tasksQuery.data?.data ?? NO_TASKS;
  const tasks = useMemo(() => allTasks.filter((t) => canApproveTicket(viewer, taskApprovalSubject(t))), [allTasks, viewer]);

  const checklistQuery = useChecklistQueueQuery();
  const instances = useMemo(() => checklistQuery.data?.pages.flatMap((p) => p.data) ?? NO_INSTANCES, [checklistQuery.data]);
  const checklistTotal = checklistQuery.data?.pages[0]?.meta?.total ?? instances.length;
  const hasMore = !!checklistQuery.hasNextPage;
  const loadedPages = checklistQuery.data?.pages.length ?? 0;
  const { fetchNextPage, isFetchingNextPage, isFetchNextPageError } = checklistQuery;
  useEffect(() => {
    if (hasMore && !isFetchingNextPage && !isFetchNextPageError && loadedPages < AUTO_LOAD_PAGES) void fetchNextPage();
  }, [hasMore, isFetchingNextPage, isFetchNextPageError, loadedPages, fetchNextPage]);
  const lookups = useQueueLookups();
  const waitingChecklistIds = useMemo(() => new Set(instances.map((i) => i.id)), [instances]);
  const allRows = useChecklistRows(instances, lookups);

  const refresh = useRefreshAfterDecision();
  const { heldIds, schedule, hold, release } = useDeferredDecisions({ afterSaved: refresh });
  const visibleRows = useVisibleChecklistRows(allRows, params, heldIds, now);

  const canSeeDecided = viewer?.role !== 'APPROVAL_MANAGER';
  const decisionsQuery = useChecklistDecisionsQuery({}, canSeeDecided);
  const decidedToday = useMemo(
    () => (decisionsQuery.data ? new Set(decisionsQuery.data.filter((d) => d.action !== 'SUBMIT').map((d) => d.instanceId)).size : null),
    [decisionsQuery.data],
  );

  const filtersActive = !!(params.q.trim() || params.store || params.dept || params.person || params.age !== 'any' || params.attention);
  const clearFilters = useCallback(() => patch({ q: '', store: null, dept: null, person: null, age: 'any', attention: false }), [patch]);

  const personNameById = useMemo(() => new Map(lookups.people.map((p) => [p.id, p.name])), [lookups.people]);
  const storeNameById = useMemo(() => new Map(lookups.stores.map((s) => [s.id, s.name])), [lookups.stores]);
  const deptNameById = useMemo(() => new Map(lookups.departments.map((d) => [d.id, d.name])), [lookups.departments]);
  const departmentNameOf = useCallback(
    (id: string | null) => (id && id !== UNASSIGNED ? (deptNameById.get(id) ?? 'Unknown department') : 'No department'),
    [deptNameById],
  );

  const ticketTaskFilter = useMemo<TicketTaskFilter>(() => ({
    store: params.store,
    person: params.person,
    cutoff: params.age === 'any' ? null : now - Number(params.age) * DAY_MS,
    needle: params.q.trim().toLowerCase(),
    personNameById,
    storeNameById,
  }), [params.store, params.person, params.age, params.q, now, personNameById, storeNameById]);
  const filteredTickets = useMemo(() => sortByWaiting(filterTickets(tickets, ticketTaskFilter), ticketWaitingSince, params.sort), [tickets, ticketTaskFilter, params.sort]);
  const filteredTasks = useMemo(() => sortByWaiting(filterTasks(tasks, ticketTaskFilter), taskWaitingSince, params.sort), [tasks, ticketTaskFilter, params.sort]);

  const heldInLoaded = useMemo(() => allRows.reduce((n, r) => n + (heldIds.has(r.id) ? 1 : 0), 0), [allRows, heldIds]);
  const checklistCount = filtersActive || !hasMore ? visibleRows.length : Math.max(visibleRows.length, checklistTotal - heldInLoaded);
  const inDept = <T extends { departmentId: string | null }>(list: T[]) =>
    params.dept ? list.filter((i) => (i.departmentId ?? UNASSIGNED) === params.dept).length : list.length;
  const notHeld = <T extends { id: string }>(list: T[]) => list.filter((i) => !heldIds.has(i.id));
  const heldTickets = tickets.length - notHeld(tickets).length;
  const heldTasks = tasks.length - notHeld(tasks).length;
  const ticketTotal = Math.max(0, tickets.length - heldTickets);
  const taskTotal = Math.max(0, tasks.length - heldTasks);
  const ticketCount = filtersActive ? inDept(notHeld(filteredTickets)) : ticketTotal;
  const taskCount = filtersActive ? inDept(notHeld(filteredTasks)) : taskTotal;
  const countsPending = checklistQuery.isPending || ticketsQuery.isPending || tasksQuery.isPending;
  const counts = useMemo(
    () => (countsPending ? null : { all: checklistCount + ticketCount + taskCount, checklists: checklistCount, tickets: ticketCount, delegations: taskCount }),
    [countsPending, checklistCount, ticketCount, taskCount],
  );

  const sectionStats = useMemo(() => {
    const inDepartment = <T extends { departmentId: string | null }>(list: T[]) =>
      params.dept ? list.filter((i) => (i.departmentId ?? UNASSIGNED) === params.dept) : list;
    return {
      checklists: { ...summarize(visibleRows.map((r) => r.waitingSince), now), count: counts?.checklists ?? visibleRows.length },
      tickets: { ...summarize(inDepartment(filteredTickets.filter((t) => !heldIds.has(t.id))).map(ticketWaitingSince), now), count: counts?.tickets ?? 0 },
      delegations: { ...summarize(inDepartment(filteredTasks.filter((t) => !heldIds.has(t.id))).map(taskWaitingSince), now), count: counts?.delegations ?? 0 },
    };
  }, [visibleRows, filteredTickets, filteredTasks, heldIds, params.dept, counts, now]);

  const [cursor, setCursor] = useState<string | null>(null);
  const rowById = useMemo(() => new Map(visibleRows.map((r) => [r.id, r])), [visibleRows]);
  const openRow = params.open ? (rowById.get(params.open) ?? null) : null;
  const activeId = openRow?.id ?? (cursor && rowById.has(cursor) ? cursor : null);
  const draft = useReviewDraft(openRow?.id ?? null);
  const [pendingSend, setPendingSend] = useState<{ id: string; itemId: string | null } | null>(null);
  if (pendingSend && openRow?.id === pendingSend.id) {
    setPendingSend(null);
    if (pendingSend.itemId) draft.startPickFor(pendingSend.id, pendingSend.itemId);
    else draft.setSending(true);
  }
  const [helpOpen, setHelpOpen] = useState(false);

  const latest = useRef<Latest>({ rows: visibleRows, activeId, openId: openRow?.id ?? null, isDesktop, draft, patch });
  useEffect(() => {
    latest.current = { rows: visibleRows, activeId, openId: openRow?.id ?? null, isDesktop, draft, patch };
  });

  const advanceFrom = useCallback((id: string) => {
    const { rows, activeId: current, openId, patch: update } = latest.current;
    const idx = rows.findIndex((r) => r.id === id);
    const next = idx < 0 ? null : (rows[idx + 1] ?? rows[idx - 1] ?? null);
    const rowEl = document.querySelector(`[data-queue-row="${CSS.escape(id)}"]`)?.closest('li');
    const hadFocus = !!rowEl && rowEl.contains(document.activeElement);
    if (current !== id && !hadFocus && openId !== id) return;
    setCursor(next?.id ?? null);
    if (openId === id) {
      update({ open: next?.id ?? null });
      if (next) return;
    }
    focusRow(next?.id ?? null);
  }, []);

  const approve = useCallback((id: string) => {
    const { rows, openId, draft: current } = latest.current;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (openId === id && current && current.pickedIds.length > 0) {
      toast('Untick the questions first, or send them back.');
      return;
    }
    advanceFrom(id);
    schedule({ id, verb: 'Approved', label: row.instance.title, run: approveRun(id) });
  }, [advanceFrom, schedule]);

  const sendBack = useCallback((row: ChecklistRow, payload: SendBackPayload) => {
    latest.current.draft?.reset();
    advanceFrom(row.id);
    schedule({
      id: row.id,
      verb: payload.itemIds.length ? `Sent ${payload.itemIds.length} back from` : 'Sent back',
      label: row.instance.title,
      run: payload.itemIds.length ? sendBackRun(row.id, payload.itemIds, payload.note, payload.fixByHours, payload.photoOnlyItemIds) : rejectRun(row.id, payload.note, payload.fixByHours),
    });
  }, [advanceFrom, schedule]);

  const approveFromPane = useCallback((row: ChecklistRow) => approve(row.id), [approve]);

  const openRun = useCallback((id: string) => {
    setCursor(id);
    setPendingSend(null);
    latest.current.patch({ open: id });
  }, []);

  const closeRun = useCallback(() => {
    setPendingSend(null);
    latest.current.patch({ open: null });
  }, []);

  const startSendBack = useCallback((id: string) => {
    const { openId, draft: current, patch: update } = latest.current;
    setCursor(id);
    if (openId === id && current) {
      current.setSending(true);
    } else {
      current?.startSendBackFor(id);
      setPendingSend({ id, itemId: null });
      update({ open: id });
    }
  }, []);

  const sendBackItem = useCallback((id: string, itemId: string) => {
    const { openId, draft: current, patch: update } = latest.current;
    setCursor(id);
    current?.startPickFor(id, itemId);
    if (openId !== id) {
      setPendingSend({ id, itemId });
      update({ open: id });
    }
  }, []);

  const move = useCallback((delta: number) => {
    const { rows, activeId: current } = latest.current;
    if (rows.length === 0) return;
    const idx = current ? rows.findIndex((r) => r.id === current) : -1;
    const target = idx < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, idx + delta));
    const id = rows[target].id;
    setCursor(id);
    setPendingSend(null);
    focusRow(id);
  }, []);

  useQueueShortcuts({
    enabled: params.view === 'waiting' && (params.tab === 'all' || params.tab === 'checklists'),
    sheetOpen: !!openRow,
    onNext: () => move(1),
    onPrevious: () => move(-1),
    onApprove: () => { const id = latest.current.activeId; if (id) approve(id); },
    onSendBack: () => { const id = latest.current.activeId; if (id) startSendBack(id); },
    onOpen: () => { const id = latest.current.activeId; if (id) openRun(id); },
    onClose: () => { if (latest.current.openId) closeRun(); },
    onHelp: () => setHelpOpen(true),
  });

  const cleanRows = useMemo(() => visibleRows.filter((r) => r.risk.clean), [visibleRows]);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const approveMany = useCallback(async (ids: string[], ask: { title: string; description: string }) => {
    if (ids.length === 0) return;
    const ok = await confirm({ ...ask, confirmLabel: `Approve ${ids.length}` });
    if (!ok) return;
    hold(ids);
    if (latest.current.openId && ids.includes(latest.current.openId)) latest.current.patch({ open: null });
    setBulk({ done: 0, total: ids.length });
    let saved = 0;
    let failed = 0;
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++];
        try {
          await approveRun(id)({ keepalive: false });
          saved += 1;
        } catch {
          failed += 1;
        }
        setBulk({ done: saved + failed, total: ids.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_PARALLEL, ids.length) }, worker));
    try { await refresh(); } catch { }
    release(ids);
    setBulk(null);
    if (failed === 0) toast.success(`Approved ${saved} ${saved === 1 ? 'checklist' : 'checklists'}`);
    else toast.error(`Approved ${saved} of ${ids.length}. ${failed} could not be saved and are back in the list.`);
  }, [confirm, hold, release, refresh]);

  const approveAllClean = useCallback(() => approveMany(cleanRows.map((r) => r.id), {
    title: `Approve ${cleanRows.length} ${cleanRows.length === 1 ? 'checklist' : 'checklists'} with no issues?`,
    description: `${filtersActive ? 'These are the ones with no issues in your current view. ' : ''}Each one is fully compliant, has its photos and was never sent back. They are approved right away.`,
  }), [approveMany, cleanRows, filtersActive]);

  const approveEverything = useCallback(() => approveMany(visibleRows.map((r) => r.id), {
    title: `Approve all ${visibleRows.length} ${visibleRows.length === 1 ? 'checklist' : 'checklists'}?`,
    description: `${filtersActive ? 'Every checklist in your current view' : 'Every checklist waiting here'} is approved right away, including ones with failed answers or missing photos. Use this only when you have already checked them.`,
  }), [approveMany, visibleRows, filtersActive]);

  const checklistsWaiting = Math.max(0, checklistTotal - heldInLoaded);
  const reviewedCount = decidedToday === null ? null : decidedToday + heldInLoaded;
  const dayTotal = reviewedCount === null ? 0 : reviewedCount + checklistsWaiting;
  const loadingTotals = checklistQuery.isPending || ticketsQuery.isPending || tasksQuery.isPending;

  const checklistsFailed = checklistQuery.isError && !checklistQuery.data;
  const ticketsFailed = ticketsQuery.isError && !ticketsQuery.data;
  const tasksFailed = tasksQuery.isError && !tasksQuery.data;

  const counter = reviewedCount !== null && dayTotal > 0 ? (
    <span role="status" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/60 bg-surface t-meta font-display font-medium text-text-secondary tabular-nums">
      <CheckCheck size={13} aria-hidden className="text-success" />
      {reviewedCount} of {dayTotal} checklists reviewed today
    </span>
  ) : null;

  const showChecklists = params.tab === 'all' || params.tab === 'checklists';
  const showTicketTask = params.tab !== 'checklists';
  const ticketTaskFailed = useMemo(() => ({ tickets: ticketsQuery.isError, tasks: tasksQuery.isError }), [ticketsQuery.isError, tasksQuery.isError]);

  const rootHref = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('dept');
    next.delete('open');
    const query = next.toString();
    return query ? `/verify?${query}` : '/verify';
  }, [searchParams]);

  const showWaiting = useCallback(() => patch({ view: 'waiting' }), [patch]);
  const showDecided = useCallback(() => patch({ view: 'decided', open: null }, { replace: false }), [patch]);
  const openDepartment = useCallback((id: string) => patch({ dept: id }, { replace: false }), [patch]);
  const clearDepartment = useCallback(() => patch({ dept: null }), [patch]);
  const showAllSections = useCallback(() => patch({ tab: 'all', open: null }), [patch]);
  const retryAll = useCallback(() => {
    if (ticketsQuery.isError) void ticketsQuery.refetch();
    if (tasksQuery.isError) void tasksQuery.refetch();
  }, [ticketsQuery, tasksQuery]);
  const retryEverything = () => {
    if (checklistsFailed) void checklistQuery.refetch();
    if (ticketsFailed) void ticketsQuery.refetch();
    if (tasksFailed) void tasksQuery.refetch();
  };
  const navigate = useNavigate();
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  if (openRow && params.view === 'waiting') {
    const position = visibleRows.findIndex((r) => r.id === openRow.id) + 1;
    return (
      <div key={openRow.id} className="view-enter flex flex-col gap-4 pt-2.5 w-full max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={closeRun} className={BACK_BUTTON}>
            <ArrowLeft size={15} aria-hidden />
            Back to list
          </button>
          {visibleRows.length > 1 && position > 0 && (
            <span className="inline-flex h-9 items-center rounded-full border border-border/60 bg-surface px-3 t-meta font-display font-semibold tabular-nums text-text-secondary" role="status">
              {position} of {visibleRows.length} waiting
            </span>
          )}
        </div>
        <ReviewPane key={openRow.id} row={openRow} draft={draft} onApprove={approveFromPane} onSendBack={sendBack} className="lg:max-h-none" />
      </div>
    );
  }

  return (
    <div className="view-enter flex flex-col gap-4 sm:gap-6 pt-2.5 w-full max-w-(--container-width) mx-auto">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(-1)} className={BACK_BUTTON}>
          <ArrowLeft size={15} aria-hidden />
          Back
        </button>
        {counter}
      </div>

      {params.view === 'waiting' && (
        <QueueSections
          tab={params.tab}
          loading={loadingTotals}
          stats={sectionStats}
          total={counts?.all ?? 0}
          failed={{ checklists: checklistsFailed, tickets: ticketsFailed, delegations: tasksFailed }}
          onRetry={retryEverything}
          onChange={(tab) => patch({ tab, open: null })}
        />
      )}

      <QueueToolbar
        params={params}
        patch={patch}
        lookups={lookups}
        attentionAvailable={showChecklists}
        filtersActive={filtersActive}
        onClear={clearFilters}
        shownCount={params.tab === 'tickets' ? ticketCount : params.tab === 'delegations' ? taskCount : params.tab === 'checklists' ? checklistCount : (counts?.all ?? null)}
        counts={counts}
        decidedCount={decidedToday}
        canSeeDecided={canSeeDecided}
      />

      {params.view === 'decided' && canSeeDecided ? (
        <DecidedToday onShowWaiting={showWaiting} waitingIds={waitingChecklistIds} />
      ) : (
        <>

          {params.dept && showTicketTask && (
            <Breadcrumbs items={[{ label: 'Verification', to: rootHref }, { label: departmentNameOf(params.dept) }]} />
          )}

          {showChecklists && (
            <div className={cn('grid grid-cols-1 gap-4 items-start', )}>
              <ChecklistList
                rows={visibleRows}
                now={now}
                activeId={activeId}
                isPending={checklistQuery.isPending}
                loadFailed={checklistQuery.isError && !checklistQuery.data}
                onRetry={() => { void checklistQuery.refetch(); }}
                filtersActive={filtersActive}
                onClearFilters={clearFilters}
                onShowDecided={showDecided}
                cleanCount={cleanRows.length}
                bulk={bulk}
                onApproveAllClean={approveAllClean}
                onApproveAll={viewer?.role === 'ADMIN' ? approveEverything : undefined}
                hasMore={hasMore}
                remaining={Math.max(0, checklistTotal - instances.length)}
                isFetchingMore={checklistQuery.isFetchingNextPage}
                onLoadMore={() => { void checklistQuery.fetchNextPage(); }}
                onShowShortcuts={() => setHelpOpen(true)}
                grouped
                titleSlot={<SectionTitle section="checklists" stats={sectionStats.checklists} now={now} />}
                onOpen={openRun}
                onApprove={approve}
                onSendBack={startSendBack}
                onSendBackItem={sendBackItem}
              />

            </div>
          )}

          {showTicketTask && (
            <TicketTaskQueue
              tab={params.tab}
              tickets={filteredTickets}
              tasks={filteredTasks}
              isPending={ticketsQuery.isPending || tasksQuery.isPending}
              departmentId={params.dept}
              departmentNameOf={departmentNameOf}
              filtersActive={filtersActive}
              failed={ticketTaskFailed}
              onRetry={retryAll}
              onShowAll={showAllSections}
              onOpenDepartment={openDepartment}
              onClearDepartment={clearDepartment}
              onClearFilters={clearFilters}
              now={now}
              personNameById={personNameById}
              decisions={{ heldIds, schedule, hold, release }}
              refresh={refresh}
            />
          )}
        </>
      )}

      <ShortcutsHelp open={helpOpen} onClose={closeHelp} />
    </div>
  );
};
