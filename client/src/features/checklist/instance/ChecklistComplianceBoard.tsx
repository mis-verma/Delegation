import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Check, ClipboardCheck, Clock, Minus, SearchX, SlidersHorizontal, Store, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Button, ChecklistProgressBar, Combobox, ENTITY_CARD_CLASS, EmptyState, IconChip, InlineError, PageHeader, PageNav,
  PANEL_CLASS, Skeleton, StatusChip, Switch, type DateRangeValue,
} from '../../../components';
import { runScores } from '../checklistCompliance';
import {
  useStoresQuery, useAssignableUsersQuery, useChecklistInstancesBoardQuery, useChecklistInstanceSummaryQuery, useFormerPeopleQuery,
} from '../hook';
import {
  formatDate, formatDeadlineTime, instanceProgressStatus, VERIFICATION_STATUS_LABEL, VERIFICATION_CHIP,
  instanceProgressToneClass, isInstanceOverdue, isFlaggedAnswer,
} from '../checklistDisplay';
import { ChecklistComplianceQuickStats, type ComplianceQuickFilterKey, type ComplianceQuickFilterCounts } from './ChecklistComplianceQuickStats';
import { GroupByControl, type GroupBy } from '../../admin/analytics/GroupByControl';
import { ChecklistInstanceKpiSection } from '../../admin/analytics/ChecklistInstanceKpiSection';
import { endOfDay } from '../../../lib/dateRange';
import { ChecklistReportButton } from '../report/ChecklistReportButton';
import type { ChecklistInstance, ChecklistInstanceStatus } from '../../../api/checklistInstances';

const STATUS_OPTIONS: { value: '' | ChecklistInstanceStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Not completed' },
  { value: 'COMPLETED', label: 'Completed' },
];

const FIELD_LABEL = 'text-xs font-display font-medium text-text-secondary';
// One control height for every control in the filter panel (Button lg, Combobox, Tabs, switch row).
const CONTROL_H = 'h-11';

interface ComplianceRowProps {
  instance: ChecklistInstance;
  /** null while the stores list is still loading, so the row never claims "Unknown store" too early. */
  storeName: string | null;
  nameById: Map<string, string>;
  namesLoading: boolean;
}

const PERSON_TONE: Record<'flag' | 'done' | 'started' | 'idle', { icon: LucideIcon; tone: string }> = {
  flag: { icon: AlertTriangle, tone: 'bg-danger' },
  done: { icon: Check, tone: 'bg-success' },
  started: { icon: Clock, tone: 'bg-warning' },
  idle: { icon: Minus, tone: 'bg-text-light' },
};

// One instance's roll-up: overall progress, plus a per-assignee breakdown of how many of this
// shared instance's items *that specific person* personally completed (via each item's
// completedBy), the closest honest signal this schema supports for "did this person do their
// part," since items are completable by any assignee, not owned individually.
const ComplianceRow = memo(({ instance, storeName, nameById, namesLoading }: ComplianceRowProps) => {
  // One pass over the items instead of a filter per assignee, per metric.
  const stats = useMemo(() => {
    const total = instance.items.length;
    let done = 0;
    let flagged = 0;
    const byPerson = new Map<string, { completed: number; flagged: number }>();
    for (const item of instance.items) {
      if (item.isDone) done += 1;
      const isFlagged = isFlaggedAnswer(item);
      if (isFlagged) flagged += 1;
      if (item.completedBy) {
        const entry = byPerson.get(item.completedBy) ?? { completed: 0, flagged: 0 };
        entry.completed += 1;
        if (isFlagged) entry.flagged += 1;
        byPerson.set(item.completedBy, entry);
      }
    }
    // Percent leaves "not applicable" questions out of both sides; the counts stay raw.
    return { total, done, flagged, byPerson, progress: runScores(instance.items).completion };
  }, [instance.items]);

  const { total, done, flagged, byPerson, progress } = stats;
  const status = instanceProgressStatus(done, total);
  const complete = status === 'COMPLETED';
  const overdue = isInstanceOverdue(instance, complete);
  const deadlineTime = formatDeadlineTime(instance);
  const verification = VERIFICATION_CHIP[instance.verificationStatus];

  return (
    <Link
      to={`/checklists/${instance.id}`}
      className={cn(ENTITY_CARD_CLASS, 'gap-3 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <p className="text-sm font-display font-bold text-text line-clamp-2 leading-snug">{instance.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted font-display">
            {storeName && <span className="flex items-center gap-1"><Store size={11} aria-hidden /> {storeName}</span>}
            <span>{formatDate(instance.periodStart)} to {formatDate(instance.periodEnd)}</span>
            {!complete && deadlineTime && <span>Due {deadlineTime}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconChip icon={verification.icon} tone={verification.tone} label={VERIFICATION_STATUS_LABEL[instance.verificationStatus]} />
          {overdue && <StatusChip status="overdue" />}
          {flagged > 0 && <IconChip icon={AlertTriangle} tone="bg-danger" label={`${flagged} flagged`} />}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <ChecklistProgressBar done={progress} total={100} bare thin tone={overdue && !complete ? 'danger' : 'auto'} className="flex-1" />
        <span className="flex items-baseline gap-1.5 shrink-0 tabular-nums font-display">
          <span className={cn('text-sm font-bold', instanceProgressToneClass(overdue, complete))}>{progress}%</span>
          <span className="text-[11px] font-medium text-text-muted">{done}/{total}</span>
        </span>
      </div>

      {instance.assigneeIds.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-dashed border-border/60">
          {instance.assigneeIds.map(id => {
            const theirs = byPerson.get(id);
            const completedByThem = theirs?.completed ?? 0;
            // A flagged answer only ever attributes to whoever actually completed that item, the
            // same honest-signal limitation the comment above already calls out for plain
            // completion counts (a shared instance has no per-item "owner" beyond completedBy).
            const flaggedByThem = theirs?.flagged ?? 0;
            const look = PERSON_TONE[flaggedByThem > 0 ? 'flag' : total > 0 && completedByThem === total ? 'done' : completedByThem > 0 ? 'started' : 'idle'];
            const name = nameById.get(id) ?? (namesLoading ? '...' : 'Unknown');
            return (
              <IconChip
                key={id}
                icon={look.icon}
                tone={look.tone}
                label={`${name} · ${completedByThem}/${total}${flaggedByThem > 0 ? ` · ${flaggedByThem} flagged` : ''}`}
              />
            );
          })}
        </div>
      )}
    </Link>
  );
});
ComplianceRow.displayName = 'ComplianceRow';

// Same shape as a real row (title + chips, bar, assignee chips) so nothing jumps when data lands.
const ComplianceRowSkeleton = () => (
  <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4 sm:p-5 min-h-36')}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-2 flex-1">
        <Skeleton className="h-4 w-2/3 max-w-72" />
        <Skeleton className="h-3 w-1/2 max-w-56" />
      </div>
      <Skeleton className="h-7 w-24 rounded-full" />
    </div>
    <Skeleton className="h-1.5 w-full rounded-full" />
    <div className="flex gap-2 pt-3 border-t border-dashed border-border/60">
      <Skeleton className="h-7 w-32 rounded-full" />
      <Skeleton className="h-7 w-28 rounded-full" />
    </div>
  </div>
);

const personName = (p: { firstName: string; lastName: string | null; email?: string }) =>
  `${p.firstName} ${p.lastName ?? ''}`.trim() || p.email || 'Unknown';

// The board spans every store org-wide, so it's the one list here that realistically reaches
// thousands of rows. Paging at 50 keeps what renders (and hydrates) bounded.
const PAGE_SIZE = 50;

// Admin-only dashboard answering "who has/hasn't filled their checklist", dynamically filterable
// by store and by person. Spans every checklist definition's generated instances (unlike
// ChecklistDefinitionDetail, which only shows instances for one definition at a time).
export const ChecklistComplianceBoard = () => {
  // Trend + rate-tile report, same component the Overview page's own Audits tab uses, reused
  // (not rebuilt) so this page reads as a report at a glance instead of opening straight onto the
  // per-instance/per-person list below.
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [range, setRangeState] = useState<DateRangeValue>({ from: null, to: null });
  const reportFrom = range.from ? range.from.toISOString() : undefined;
  const reportTo = range.to ? endOfDay(range.to).toISOString() : undefined;

  const [storeId, setStoreIdState] = useState('');
  const [assigneeId, setAssigneeIdState] = useState('');
  const [status, setStatusState] = useState<'' | ChecklistInstanceStatus>('');
  // Off by default: a deleted checklist's history is kept for audit purposes, but shouldn't
  // clutter the board every viewer sees day to day; this is the explicit "show me anyway" switch.
  const [includeDeleted, setIncludeDeletedState] = useState(false);
  // Layered on top of the store/person/status filters above, same as TicketList's quickFilter:
  // click a tile to narrow the list further, click it again (or "Total") to clear.
  const [quickFilter, setQuickFilter] = useState<ComplianceQuickFilterKey>('all');
  const [page, setPage] = useState(1);

  // Every filter resets the page, because page 4 of the old result set is meaningless against the
  // new one and usually past its end. Done in the setters rather than an effect watching them,
  // an effect would render the stale page once before correcting itself.
  const setStoreId = (value: string) => { setStoreIdState(value); setPage(1); };
  const setAssigneeId = (value: string) => { setAssigneeIdState(value); setPage(1); };
  const setStatus = (value: '' | ChecklistInstanceStatus) => { setStatusState(value); setPage(1); };
  const setIncludeDeleted = (value: boolean) => { setIncludeDeletedState(value); setPage(1); };
  const setRange = (value: DateRangeValue) => { setRangeState(value); setPage(1); };
  const setLastMonth = () => {
    const now = new Date();
    setRange({
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0),
    });
  };
  const toggleQuickFilter = (key: ComplianceQuickFilterKey) => {
    setQuickFilter((prev) => (key === 'all' || prev === key ? 'all' : key));
    setPage(1);
  };
  const hasFilters = !!(storeId || assigneeId || status || includeDeleted || range.from || range.to || quickFilter !== 'all');
  const clearFilters = () => {
    setStoreIdState('');
    setAssigneeIdState('');
    setStatusState('');
    setIncludeDeletedState(false);
    setRangeState({ from: null, to: null });
    setQuickFilter('all');
    setPage(1);
  };

  const { data: stores = [], isPending: storesPending } = useStoresQuery();
  // Scoped to the selected store, for the Person filter's own option list.
  const { data: people = [] } = useAssignableUsersQuery(undefined, storeId || undefined);
  // Unscoped roster so assignee chips resolve to real names even for instances outside whichever
  // store is currently selected in the filter above.
  const { data: allPeople = [], isPending: allPeoplePending } = useAssignableUsersQuery();
  // Deactivated people are not in the assignable roster, but their name still has to read right on
  // old runs. Failure here just means no "(left)" tag, never a broken page.
  const { data: formerPeople = [], isPending: formerPending } = useFormerPeopleQuery();

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPeople) map.set(p.id, personName(p));
    for (const p of formerPeople) map.set(p.id, `${personName(p)} (left)`);
    return map;
  }, [allPeople, formerPeople]);
  const storeNameById = useMemo(() => new Map(stores.map(s => [s.id, s.name])), [stores]);
  const namesLoading = allPeoplePending || formerPending;

  const storeOptions = useMemo(() => stores.map(s => ({ value: s.id, label: s.name })), [stores]);
  const personOptions = useMemo(() => people.map(p => ({ value: p.id, label: personName(p) })), [people]);

  // The tile and the Status control narrow the same dimension, so they resolve to one server
  // `status`, the tile wins when set.
  const effectiveStatus: ChecklistInstanceStatus | undefined =
    quickFilter === 'completed' ? 'COMPLETED'
    : quickFilter === 'pending' ? 'OPEN'
    : quickFilter === 'overdue' ? 'OVERDUE'
    : (status || undefined);

  const { data: instancePage, isPending, isError, isFetching, refetch } = useChecklistInstancesBoardQuery({
    storeId: storeId || undefined,
    assigneeId: assigneeId || undefined,
    status: effectiveStatus,
    from: reportFrom,
    to: reportTo,
    includeDeleted,
    page,
    limit: PAGE_SIZE,
  });
  const visibleInstances = instancePage?.data;
  const totalPages = instancePage?.meta.totalPages ?? 1;

  // Counted by the database rather than by reducing the fetched page: a tile that says "23"
  // derived from the page would silently become the page size the moment the list paginates.
  const { data: counts, isPending: summaryPending, isError: summaryError, refetch: refetchSummary } = useChecklistInstanceSummaryQuery({
    storeId: storeId || undefined,
    assigneeId: assigneeId || undefined,
    from: reportFrom,
    to: reportTo,
    includeDeleted,
  });
  const summary = useMemo<ComplianceQuickFilterCounts | undefined>(
    () => counts && { all: counts.total, completed: counts.completed, pending: counts.pending, overdue: counts.overdue },
    [counts],
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <PageHeader
        icon={ClipboardCheck}
        title="Checklist Compliance"
        subtitle="Completion and quality trends, plus who's filled their checklist and who hasn't."
        actions={<ChecklistReportButton />}
      />

      {/* One filter panel for the whole page: everything that narrows what's shown below lives here. */}
      <section aria-label="Filters" className={cn(PANEL_CLASS, 'flex flex-col gap-4 p-4 sm:p-5')}>
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center size-7 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300 shrink-0">
            <SlidersHorizontal size={14} aria-hidden />
          </span>
          <h2 className="text-sm font-display font-bold text-text">Filters</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="lg" className="px-4 text-sm" onClick={setLastMonth}>
            Last month
          </Button>
          <GroupByControl groupBy={groupBy} onGroupByChange={setGroupBy} range={range} onRangeChange={setRange} />
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-4 border-t border-dashed border-border/60">
          <div className="flex flex-col gap-1.5 w-full sm:w-52">
            <label htmlFor="compliance-store" className={FIELD_LABEL}>Store</label>
            <Combobox
              id="compliance-store"
              value={storeId}
              onChange={setStoreId}
              options={storeOptions}
              emptyOptionLabel="All stores"
              isLoading={storesPending}
              className={cn(CONTROL_H, 'rounded-xl')}
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full sm:w-52">
            <label htmlFor="compliance-person" className={FIELD_LABEL}>Person</label>
            <Combobox
              id="compliance-person"
              value={assigneeId}
              onChange={setAssigneeId}
              options={personOptions}
              emptyOptionLabel="All people"
              className={cn(CONTROL_H, 'rounded-xl')}
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full sm:w-fit">
            <span id="compliance-status-label" className={FIELD_LABEL}>Status</span>
            <Tabs value={status} onValueChange={(v) => setStatus(v as '' | ChecklistInstanceStatus)}>
              <TabsList aria-labelledby="compliance-status-label" className={cn(CONTROL_H, 'w-full sm:w-fit')}>
                {STATUS_OPTIONS.map(opt => (
                  <TabsTrigger key={opt.value || 'all'} value={opt.value} className="h-full text-xs">
                    {opt.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <label
            htmlFor="compliance-include-deleted"
            className={cn(
              CONTROL_H,
              'flex items-center gap-2.5 px-3 rounded-xl border text-xs font-display font-medium cursor-pointer transition-colors duration-150',
              includeDeleted
                ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300'
                : 'border-border bg-surface text-text-secondary hover:border-border-hover',
            )}
          >
            <Switch id="compliance-include-deleted" checked={includeDeleted} onChange={setIncludeDeleted} />
            Show deleted checklists
          </label>
        </div>
      </section>

      {/* isOrgWideRole=false here on purpose: these cards' click destination on the Overview page
          is this exact page, so on this page itself there's nowhere further to send a click; the
          real per-instance rows they'd otherwise link to already render directly below. */}
      <ChecklistInstanceKpiSection groupBy={groupBy} from={reportFrom} to={reportTo} isOrgWideRole={false} includeDeleted={includeDeleted} />

      <div className="flex items-center gap-3 pt-4 border-t border-border/60">
        <h2 className="text-sm font-display font-bold text-text shrink-0">Who's done what</h2>
        <p className="text-xs font-display text-text-muted">Reflects the filters above.</p>
      </div>

      <ChecklistComplianceQuickStats
        counts={summary}
        active={quickFilter}
        onToggle={toggleQuickFilter}
        isLoading={summaryPending}
        isError={summaryError}
        onRetry={() => refetchSummary()}
      />

      {isPending && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => <ComplianceRowSkeleton key={i} />)}
        </div>
      )}

      {isError && <InlineError message="We couldn't load the checklists. Check your connection and try again." onRetry={() => refetch()} />}

      {!isPending && !isError && visibleInstances?.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="Nothing matches these filters"
          description={hasFilters ? 'Try a wider date range, another store or another person.' : 'No checklists have been generated yet.'}
          action={hasFilters ? { label: 'Clear filters', onClick: clearFilters } : undefined}
        />
      )}

      {!!visibleInstances?.length && (
        // keepPreviousData keeps the old page on screen while the next one loads: dim it so the
        // change reads as "updating" instead of the screen silently freezing.
        <div className={cn('flex flex-col gap-3 transition-opacity duration-200', isFetching && 'opacity-60')} aria-busy={isFetching}>
          {visibleInstances.map((instance) => (
            <ComplianceRow
              key={instance.id}
              instance={instance}
              storeName={storesPending ? null : (storeNameById.get(instance.storeId) ?? 'Unknown store')}
              nameById={nameById}
              namesLoading={namesLoading}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <PageNav page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
};
