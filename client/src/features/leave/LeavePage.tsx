import { startTransition, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarOff, CalendarPlus, Plus, Search } from 'lucide-react';
import { CreateButton } from '../../components/createButton';
import { Combobox, EmptyState, Fab, InlineError, SearchField, Skeleton, ViewToggle, useConfirm, type ViewTab } from '../../components';
import { StatusFigureStats, type StatusFigureItem } from '../dashboard/StatusFigureStats';
import { PeriodTabControl } from '../dashboard/PeriodTabControl';
import { useAuth } from '../../context/AuthContext';
import { LEAVE_RECORDER_ROLES } from '../../api/auth';
import { useIsReadOnlyViewer } from '../owner/useReadOnlyViewer';
import { useOrgToday } from '../checklist/useOrgToday';
import type { LeaveEntry } from '../../api/leave';
import { useDecideLeaveMutation, useLeaveQuery, useRemoveLeaveMutation } from './hook';
import { LeaveForm } from './LeaveForm';
import { DeclineDialog } from './LeaveRequests';
import { LeaveListSkeleton, LeaveViews } from './LeaveViews';
import { WeekStrip } from './WeekStrip';
import {
  GROUP_ORDER,
  STATUS_FILTERS,
  STATUS_FILTER_LABEL,
  STATUS_FILTER_OF,
  VIEW_KEYS,
  WEEK,
  addDays,
  groupOf,
  phaseOf,
  plural,
  removeCopy,
  type GroupKey,
  type LeaveActions,
  type LeaveGroup,
  type LeaveView,
  type Phase,
  type Show,
  type StatusFilter,
} from './leaveDisplay';

const VIEW_TABS: ViewTab<LeaveView>[] = [
  { key: 'cards', label: 'Cards' },
  { key: 'list', label: 'List' },
  { key: 'table', label: 'Table', mobileHidden: true },
];

const SHOW_ITEMS: readonly StatusFigureItem<Show>[] = [
  { key: 'all', kind: 'total', label: 'All leave', short: 'All', help: 'Approved leave now, coming up or back in the last 30 days. Tap to show it all.' },
  { key: 'now', kind: 'due', label: 'On leave now', short: 'Now', help: 'People away today. Tap to show only these, tap again to show all.' },
  { key: 'coming', kind: 'pending', label: 'Coming up', short: 'Coming', help: 'Approved leave that has not started yet. Tap to show only these, tap again to show all.' },
  { key: 'recent', kind: 'completed', label: 'Last 30 days', short: 'Past', help: 'Leave that ended in the last 30 days. Tap to show only these, tap again to show all.' },
];

const isOneOf = <T extends string>(options: readonly T[], value: string | null): value is T => !!value && (options as readonly string[]).includes(value);

export const LeavePage = () => {
  const confirm = useConfirm();
  const today = useOrgToday();
  const { user } = useAuth();
  const readOnly = useIsReadOnlyViewer() || user?.role === 'OWNER';
  const canRecordOthers = !!user && LEAVE_RECORDER_ROLES.includes(user.role);
  const createLabel = canRecordOthers ? 'Record leave' : 'Ask for leave';
  const { data, isPending, isError, refetch } = useLeaveQuery();
  const { mutate: removeLeave, isPending: removePending, variables: removeVars } = useRemoveLeaveMutation();
  const { mutate: decideLeave, isPending: decidePending, variables: decideVars } = useDecideLeaveMutation();
  const [showForm, setShowForm] = useState(false);
  const [declining, setDeclining] = useState<LeaveEntry | null>(null);
  const [department, setDepartment] = useState('');
  const [show, setShow] = useState<Show>('all');

  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusFilter = isOneOf(STATUS_FILTERS, rawStatus) ? rawStatus : 'all';
  const rawView = params.get('view');
  const view: LeaveView = isOneOf(VIEW_KEYS, rawView) ? rawView : 'cards';
  const [query, setQueryState] = useState(() => params.get('q') ?? '');

  const setParam = useCallback((key: string, value: string, fallback = '') => {
    startTransition(() => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      }, { replace: true });
    });
  }, [setParams]);
  const setView = useCallback((next: LeaveView) => setParam('view', next, 'cards'), [setParam]);
  const setStatus = useCallback((next: StatusFilter) => setParam('status', next, 'all'), [setParam]);
  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    setParam('q', next.trim());
  }, [setParam]);

  const all = useMemo(() => data ?? [], [data]);
  const listed = useMemo(() => all.filter((e) => groupOf(e, today) !== null), [all, today]);

  const departmentOptions = useMemo(() => {
    const names = [...new Set(listed.map((e) => e.departmentName).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b));
    return names.map((n) => ({ value: n, label: n }));
  }, [listed]);

  const { scoped, statusCounts, phaseCounts, hasApproved, upcoming } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const inScope = listed.filter((e) => (!department || e.departmentName === department)
      && (!needle || [e.userName, e.departmentName, e.reason].some((v) => v?.toLowerCase().includes(needle))));
    const byStatus: Record<StatusFilter, number> = { all: inScope.length, pending: 0, approved: 0, declined: 0 };
    const byPhase: Record<Show, number> = { all: 0, now: 0, coming: 0, recent: 0 };
    inScope.forEach((e) => {
      byStatus[STATUS_FILTER_OF[e.status]] += 1;
      if (e.status !== 'APPROVED') return;
      byPhase.all += 1;
      byPhase[phaseOf(e, today)] += 1;
    });
    return {
      scoped: inScope,
      statusCounts: byStatus,
      phaseCounts: byPhase,
      hasApproved: listed.some((e) => e.status === 'APPROVED'),
      upcoming: listed.filter((e) => e.status === 'APPROVED' && e.endDate >= today),
    };
  }, [listed, query, department, today]);

  const groups = useMemo<LeaveGroup[]>(() => {
    const buckets: Record<GroupKey, LeaveEntry[]> = { decide: [], mine: [], now: [], coming: [], recent: [] };
    scoped.forEach((e) => {
      const key = groupOf(e, today);
      if (!key) return;
      if (status !== 'all' && STATUS_FILTER_OF[e.status] !== status) return;
      if (show !== 'all' && key !== show) return;
      buckets[key].push(e);
    });
    buckets.recent.reverse();
    return GROUP_ORDER.map((key) => ({ key, entries: buckets[key] })).filter((g) => g.entries.length > 0);
  }, [scoped, status, show, today]);

  const showItems = useMemo<StatusFigureItem<Show>[]>(() => {
    const weekEnd = addDays(today, WEEK);
    const nowEntries = scoped.filter((e) => e.status === 'APPROVED' && phaseOf(e, today) === 'now');
    const openOnNow = nowEntries.reduce((sum, e) => sum + e.openTickets + e.openDelegations, 0);
    const startingThisWeek = scoped.filter((e) => e.status === 'APPROVED' && phaseOf(e, today) === 'coming' && e.startDate <= weekEnd).length;
    const notes: Partial<Record<Phase, string>> = {
      now: openOnNow > 0 ? `${plural(openOnNow, 'item', 'items')} still open` : 'Nothing left open',
      coming: `${startingThisWeek} start this week`,
    };
    return SHOW_ITEMS.map((item) => {
      const note = item.key === 'all' ? undefined : notes[item.key];
      return note ? { ...item, note } : item;
    });
  }, [scoped, today]);

  const toggleShow = useCallback((key: Show) => {
    const next = show === key ? 'all' : key;
    setShow(next);
    if (next !== 'all' && status !== 'all' && status !== 'approved') setStatus('approved');
  }, [show, status, setStatus]);

  const pickStatus = useCallback((next: StatusFilter) => {
    setStatus(next);
    if (next !== 'all' && next !== 'approved') setShow('all');
  }, [setStatus]);

  const clearFilters = useCallback(() => {
    setQueryState('');
    setDepartment('');
    setShow('all');
    startTransition(() => setParams((prev) => {
      const next = new URLSearchParams(prev);
      ['q', 'status'].forEach((k) => next.delete(k));
      return next;
    }, { replace: true }));
  }, [setParams]);

  const remove = useCallback(async (entry: LeaveEntry) => {
    const copy = removeCopy(entry, today);
    const ok = await confirm({ title: copy.title, description: copy.description, confirmLabel: copy.confirmLabel, variant: 'danger' });
    if (ok) removeLeave({ id: entry.id, message: copy.toast });
  }, [confirm, removeLeave, today]);

  const handleRemove = useCallback((entry: LeaveEntry) => { void remove(entry); }, [remove]);
  const approve = useCallback((entry: LeaveEntry) => decideLeave({ id: entry.id, approve: true }), [decideLeave]);
  const decline = useCallback((note: string) => {
    if (!declining) return;
    decideLeave({ id: declining.id, approve: false, note: note || undefined }, { onSuccess: () => setDeclining(null) });
  }, [decideLeave, declining]);

  const actionsFor = useCallback((entry: LeaveEntry): LeaveActions => {
    const group = groupOf(entry, today);
    const mayDecide = group === 'decide' && entry.canDecide && !readOnly;
    const mayRemove = entry.canRemove && (group === 'mine' ? !readOnly : entry.status === 'APPROVED');
    return {
      onApprove: mayDecide ? approve : undefined,
      onDecline: mayDecide ? setDeclining : undefined,
      onRemove: mayRemove ? handleRemove : undefined,
    };
  }, [today, readOnly, approve, handleRemove]);

  const removing = removePending ? removeVars?.id ?? null : null;
  const deciding = decidePending ? decideVars?.id ?? null : null;
  const isBusy = useCallback((id: string) => removing === id || deciding === id, [removing, deciding]);
  const ready = !isPending && !isError;
  const nothing = ready && listed.length === 0;
  const noMatch = ready && listed.length > 0 && groups.length === 0;
  const openForm = () => setShowForm(true);

  const pillLabels = useMemo(
    () => Object.fromEntries(STATUS_FILTERS.map((key) => [key, `${STATUS_FILTER_LABEL[key]} ${statusCounts[key]}`])) as Record<StatusFilter, string>,
    [statusCounts],
  );

  return (
    <div className="mx-auto flex w-full max-w-(--container-width) flex-col gap-3 pt-2.5 sm:gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="t-section font-display font-bold text-text">Leave</h1>
          <p className="hidden t-meta font-display text-text-muted sm:block">
            {canRecordOthers ? 'People on leave are skipped for checklists, so their score does not drop.' : 'Ask for days off here. Once your manager approves, your checklists are skipped on those days.'}
          </p>
        </div>
        {!readOnly && <CreateButton label={createLabel} onClick={openForm} className="hidden md:inline-flex" />}
      </div>

      {isPending && (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading leave">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl sm:h-28" />)}</div>
          <LeaveListSkeleton view={view} />
        </div>
      )}

      {isError && <InlineError message="We couldn't load the leave list. Check your connection and try again." onRetry={() => { void refetch(); }} />}

      {ready && hasApproved && (
        <>
          <StatusFigureStats label="Show leave" items={showItems} counts={phaseCounts} active={show} onToggle={toggleShow} />
          <WeekStrip entries={upcoming} today={today} />
        </>
      )}

      {ready && listed.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SearchField value={query} onChange={setQuery} label="Search leave by name, department or reason" placeholder="Search name, department or reason" className="basis-full sm:basis-56" />
          {departmentOptions.length > 1 && (
            <div className="w-full sm:w-60">
              <Combobox
                id="leave-department"
                label="Department"
                value={department}
                onChange={setDepartment}
                options={departmentOptions}
                emptyOptionLabel="All departments"
                placeholder="All departments"
              />
            </div>
          )}
          <PeriodTabControl value={status} options={STATUS_FILTERS} labels={pillLabels} onChange={pickStatus} />
          <div className="sm:ml-auto">
            <ViewToggle tabs={VIEW_TABS} value={view} onChange={setView} storageKey="view:leave" />
          </div>
        </div>
      )}

      {nothing && (
        <EmptyState
          icon={CalendarOff}
          title="Nobody is on leave"
          description={canRecordOthers
            ? 'Record leave when someone is away on a working day, so their checklists are skipped and their score stays fair.'
            : 'Need a day off? Ask here. Your manager approves it and your checklists are skipped on those days.'}
          action={readOnly ? undefined : { label: createLabel, icon: Plus, onClick: openForm }}
        />
      )}

      {noMatch && (
        <EmptyState icon={Search} title="No leave matches" description="Try another name, status or department." action={{ label: 'Clear search and filters', onClick: clearFilters }} />
      )}

      {ready && groups.length > 0 && <LeaveViews view={view} groups={groups} today={today} isBusy={isBusy} actionsFor={actionsFor} />}

      {!readOnly && (
        <Fab
          sheetTitle="Create"
          actions={[{
            key: 'leave',
            label: createLabel,
            description: canRecordOthers ? 'Skip their checklists for the days they are away' : 'Your manager approves it',
            icon: canRecordOthers ? CalendarOff : CalendarPlus,
            onClick: openForm,
          }]}
        />
      )}

      {showForm && <LeaveForm onClose={() => setShowForm(false)} />}
      {declining && <DeclineDialog entry={declining} busy={deciding === declining.id} onClose={() => setDeclining(null)} onConfirm={decline} />}
    </div>
  );
};
