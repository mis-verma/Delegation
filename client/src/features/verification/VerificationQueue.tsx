import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, CheckCheck, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EmptyState, InlineError, PageHeader, PANEL_CLASS, useConfirm } from '../../components';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useTicketsByStatusQuery } from '../tickets/hook';
import { usePendingTasksQuery } from './usePendingTasksQuery';
import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';
import type { ChecklistInstance } from '../../api/checklistInstances';
import { ChecklistList } from './ChecklistList';
import { DecidedToday } from './DecidedToday';
import { QueueToolbar } from './QueueToolbar';
import { ReviewPane, ReviewSheet, type SendBackPayload } from './ReviewPane';
import { ShortcutsHelp } from './ShortcutsHelp';
import { TicketTaskQueue } from './TicketTaskQueue';
import { approveRun, rejectRun, sendBackRun } from './decisionRequests';
import { filterTasks, filterTickets, oldestCreated, sortByCreated, type TicketTaskFilter } from './ticketTaskFilters';
import { useChecklistDecisionsQuery } from './useChecklistDecisions';
import {
  useChecklistQueueQuery, useChecklistRows, useNow, useQueueLookups, useVisibleChecklistRows,
} from './useChecklistQueue';
import { useDeferredDecisions } from './useDeferredDecisions';
import { useQueueParams, type QueueParamsPatch } from './useQueueParams';
import { useQueueShortcuts } from './useQueueShortcuts';
import { useRefreshAfterDecision } from './useRefreshAfterDecision';
import { useReviewDraft, type ReviewDraft } from './useReviewDraft';
import { DAY_MS, UNASSIGNED, formatWaiting, type ChecklistRow } from './verificationModel';

const NO_TICKETS: Ticket[] = [];
const NO_TASKS: Task[] = [];
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

  const ticketsQuery = useTicketsByStatusQuery('PENDING_APPROVAL');
  const tasksQuery = usePendingTasksQuery('pending_approval');
  const tickets = ticketsQuery.data?.data ?? NO_TICKETS;
  const tasks = tasksQuery.data?.data ?? NO_TASKS;

  const checklistQuery = useChecklistQueueQuery();
  const instances = useMemo(() => checklistQuery.data?.pages.flatMap((p) => p.data) ?? NO_INSTANCES, [checklistQuery.data]);
  const checklistTotal = checklistQuery.data?.pages[0]?.meta?.total ?? instances.length;
  const hasMore = !!checklistQuery.hasNextPage;
  const lookups = useQueueLookups();
  const allRows = useChecklistRows(instances, lookups);

  const refresh = useRefreshAfterDecision();
  const { heldIds, schedule, hold, release } = useDeferredDecisions({ afterSaved: refresh });
  const visibleRows = useVisibleChecklistRows(allRows, params, heldIds, now);

  const decisionsQuery = useChecklistDecisionsQuery();
  const decidedToday = useMemo(
    () => (decisionsQuery.data ? decisionsQuery.data.filter((d) => d.action !== 'SUBMIT').length : null),
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
  const filteredTickets = useMemo(() => sortByCreated(filterTickets(tickets, ticketTaskFilter), params.sort), [tickets, ticketTaskFilter, params.sort]);
  const filteredTasks = useMemo(() => sortByCreated(filterTasks(tasks, ticketTaskFilter), params.sort), [tasks, ticketTaskFilter, params.sort]);

  const heldInLoaded = useMemo(() => allRows.reduce((n, r) => n + (heldIds.has(r.id) ? 1 : 0), 0), [allRows, heldIds]);
  const checklistCount = filtersActive || !hasMore ? visibleRows.length : Math.max(visibleRows.length, checklistTotal - heldInLoaded);
  const inDept = <T extends { departmentId: string | null }>(list: T[]) =>
    params.dept ? list.filter((i) => (i.departmentId ?? UNASSIGNED) === params.dept).length : list.length;
  const notHeld = <T extends { id: string }>(list: T[]) => list.filter((i) => !heldIds.has(i.id));
  const heldTickets = tickets.length - notHeld(tickets).length;
  const heldTasks = tasks.length - notHeld(tasks).length;
  const ticketTotal = Math.max(0, (ticketsQuery.data?.total ?? tickets.length) - heldTickets);
  const taskTotal = Math.max(0, (tasksQuery.data?.total ?? tasks.length) - heldTasks);
  const ticketCount = filtersActive ? inDept(notHeld(filteredTickets)) : ticketTotal;
  const taskCount = filtersActive ? inDept(notHeld(filteredTasks)) : taskTotal;
  const counts = checklistQuery.isPending || ticketsQuery.isPending || tasksQuery.isPending
    ? null
    : { all: checklistCount + ticketCount + taskCount, checklists: checklistCount, tickets: ticketCount, delegations: taskCount };

  const waitingTotal = ticketTotal + taskTotal + Math.max(0, checklistTotal - heldInLoaded);
  const oldestWaiting = useMemo(() => {
    const times = [
      ...allRows.filter((r) => !heldIds.has(r.id)).map((r) => r.waitingSince),
      oldestCreated(tickets),
      oldestCreated(tasks),
    ].filter((t): t is number => t !== null);
    return times.length ? Math.min(...times) : null;
  }, [allRows, heldIds, tickets, tasks]);

  const [cursor, setCursor] = useState<string | null>(null);
  const rowById = useMemo(() => new Map(visibleRows.map((r) => [r.id, r])), [visibleRows]);
  const openRow = params.open ? (rowById.get(params.open) ?? null) : null;
  const activeId = openRow?.id ?? (cursor && rowById.has(cursor) ? cursor : null);
  const draft = useReviewDraft(openRow?.id ?? null);
  const [helpOpen, setHelpOpen] = useState(false);

  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !isDesktop || params.view !== 'waiting' || params.open || visibleRows.length === 0) return;
    autoOpened.current = true;
    patch({ open: visibleRows[0].id });
  }, [isDesktop, params.view, params.open, visibleRows, patch]);

  const latest = useRef<Latest>({ rows: visibleRows, activeId, openId: openRow?.id ?? null, isDesktop, draft, patch });
  useEffect(() => {
    latest.current = { rows: visibleRows, activeId, openId: openRow?.id ?? null, isDesktop, draft, patch };
  });

  const advanceFrom = useCallback((id: string) => {
    const { rows, activeId: current, openId, isDesktop: desktop, patch: update } = latest.current;
    const idx = rows.findIndex((r) => r.id === id);
    const next = idx < 0 ? null : (rows[idx + 1] ?? rows[idx - 1] ?? null);
    const rowEl = document.querySelector(`[data-queue-row="${CSS.escape(id)}"]`)?.closest('li');
    const hadFocus = !!rowEl && rowEl.contains(document.activeElement);
    if (current !== id && !hadFocus && openId !== id) return;
    setCursor(next?.id ?? null);
    if (openId === id) update({ open: desktop ? (next?.id ?? null) : null });
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
    advanceFrom(row.id);
    latest.current.draft?.reset();
    schedule({
      id: row.id,
      verb: 'Sent back',
      label: row.instance.title,
      run: payload.itemIds.length ? sendBackRun(row.id, payload.itemIds, payload.note) : rejectRun(row.id, payload.note),
    });
  }, [advanceFrom, schedule]);

  const approveFromPane = useCallback((row: ChecklistRow) => approve(row.id), [approve]);

  const openRun = useCallback((id: string) => {
    setCursor(id);
    latest.current.patch({ open: id });
  }, []);

  const closeRun = useCallback(() => latest.current.patch({ open: null }), []);

  const startSendBack = useCallback((id: string) => {
    const { openId, draft: current, patch: update } = latest.current;
    setCursor(id);
    if (openId === id && current) {
      current.setSending(true);
    } else {
      current?.startSendBackFor(id);
      update({ open: id });
    }
  }, []);

  const move = useCallback((delta: number) => {
    const { rows, activeId: current, isDesktop: desktop, patch: update } = latest.current;
    if (rows.length === 0) return;
    const idx = current ? rows.findIndex((r) => r.id === current) : -1;
    const target = idx < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, idx + delta));
    const id = rows[target].id;
    setCursor(id);
    if (desktop) update({ open: id });
    focusRow(id);
  }, []);

  useQueueShortcuts({
    enabled: params.view === 'waiting' && (params.tab === 'all' || params.tab === 'checklists'),
    sheetOpen: !isDesktop && !!openRow,
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
  const approveAllClean = useCallback(async () => {
    const ids = cleanRows.map((r) => r.id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Approve ${ids.length} ${ids.length === 1 ? 'checklist' : 'checklists'} with no issues?`,
      description: `${filtersActive ? 'These are the ones with no issues in your current view. ' : ''}Each one is fully compliant, has its photos and was never sent back. They are approved right away.`,
      confirmLabel: `Approve ${ids.length}`,
    });
    if (!ok) return;
    hold(ids);
    if (latest.current.openId && ids.includes(latest.current.openId)) latest.current.patch({ open: null });
    setBulk({ done: 0, total: ids.length });
    let saved = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await approveRun(id)({ keepalive: false });
        saved += 1;
      } catch {
        failed += 1;
      }
      setBulk({ done: saved + failed, total: ids.length });
    }
    try { await refresh(); } catch { }
    release(ids);
    setBulk(null);
    if (failed === 0) toast.success(`Approved ${saved} ${saved === 1 ? 'checklist' : 'checklists'}`);
    else toast.error(`Approved ${saved} of ${ids.length}. ${failed} could not be saved and are back in the list.`);
  }, [cleanRows, confirm, filtersActive, hold, release, refresh]);

  const reviewedCount = decidedToday === null ? null : decidedToday + heldIds.size;
  const dayTotal = reviewedCount === null ? 0 : reviewedCount + waitingTotal;
  const loadingTotals = checklistQuery.isPending || ticketsQuery.isPending || tasksQuery.isPending;

  const subtitle = loadingTotals
    ? <span className="block h-4 w-56 skeleton-shimmer rounded-md bg-surface-active" aria-hidden />
    : waitingTotal === 0
      ? 'Nothing is waiting for your review'
      : `${waitingTotal} waiting for your review${oldestWaiting ? `. Oldest waiting: ${formatWaiting(oldestWaiting, now)}` : ''}`;

  const counter = reviewedCount !== null && dayTotal > 0 ? (
    <span role="status" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/60 bg-surface t-meta font-display font-medium text-text-secondary tabular-nums">
      <CheckCheck size={13} aria-hidden className="text-success" />
      {reviewedCount} of {dayTotal} reviewed today
    </span>
  ) : null;

  const showChecklists = params.tab === 'all' || params.tab === 'checklists';
  const showTicketTask = params.tab !== 'checklists';
  const ticketTaskFailed = ticketsQuery.isError || tasksQuery.isError;
  const splitPane = checklistQuery.isPending || visibleRows.length > 0;

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
  const retryAll = useCallback(() => { void ticketsQuery.refetch(); void tasksQuery.refetch(); }, [ticketsQuery, tasksQuery]);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  return (
    <div className="flex flex-col gap-6 pt-2.5 w-full max-w-(--container-width) mx-auto">
      <PageHeader icon={ShieldCheck} title="Verification" subtitle={subtitle} actions={counter} />

      <QueueToolbar
        params={params}
        patch={patch}
        lookups={lookups}
        attentionAvailable={showChecklists}
        filtersActive={filtersActive}
        onClear={clearFilters}
        shownCount={params.tab === 'tickets' ? ticketCount : params.tab === 'delegations' ? taskCount : params.tab === 'checklists' ? checklistCount : (counts?.all ?? null)}
        counts={counts}
        decidedCount={decisionsQuery.data?.length ?? null}
      />

      {params.view === 'decided' ? (
        <DecidedToday onShowWaiting={showWaiting} />
      ) : (
        <>

          {params.dept && showTicketTask && (
            <Breadcrumbs items={[{ label: 'Verification', to: rootHref }, { label: departmentNameOf(params.dept) }]} />
          )}

          {showChecklists && (
            <div className={cn('grid grid-cols-1 gap-4 items-start', splitPane && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
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
                hasMore={hasMore}
                remaining={Math.max(0, checklistTotal - instances.length)}
                isFetchingMore={checklistQuery.isFetchingNextPage}
                onLoadMore={() => { void checklistQuery.fetchNextPage(); }}
                onShowShortcuts={() => setHelpOpen(true)}
                onOpen={openRun}
                onApprove={approve}
                onSendBack={startSendBack}
              />

              {isDesktop && visibleRows.length > 0 && (
                <aside className="lg:sticky lg:top-4 min-w-0" aria-label="Review">
                  {openRow ? (
                    <ReviewPane key={openRow.id} row={openRow} draft={draft} onApprove={approveFromPane} onSendBack={sendBack} />
                  ) : (
                    <div className={PANEL_CLASS}>
                      <EmptyState
                        size="compact"
                        icon={ListChecks}
                        title="Pick a checklist to review"
                        description="Use J and K to move, Enter to open."
                        className="border-0"
                      />
                    </div>
                  )}
                </aside>
              )}
            </div>
          )}

          {showTicketTask && (
            <>
              {ticketTaskFailed && (
                <InlineError message="We couldn't load the tickets and delegations waiting for review. Check your connection and try again." onRetry={retryAll} />
              )}
              <TicketTaskQueue
                tab={params.tab}
                tickets={filteredTickets}
                tasks={filteredTasks}
                isPending={ticketsQuery.isPending || tasksQuery.isPending}
                departmentId={params.dept}
                departmentNameOf={departmentNameOf}
                filtersActive={filtersActive}
                onOpenDepartment={openDepartment}
                onClearDepartment={clearDepartment}
                onClearFilters={clearFilters}
                now={now}
                personNameById={personNameById}
                decisions={{ heldIds, schedule, hold, release }}
                refresh={refresh}
              />
            </>
          )}
        </>
      )}

      {!isDesktop && (
        <ReviewSheet row={openRow} draft={draft} onApprove={approveFromPane} onSendBack={sendBack} onClose={closeRun} />
      )}
      <ShortcutsHelp open={helpOpen} onClose={closeHelp} />
    </div>
  );
};
