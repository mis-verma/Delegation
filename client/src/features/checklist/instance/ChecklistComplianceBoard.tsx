import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Check, ChevronDown, ClipboardCheck, Clock, Minus, SearchX, SlidersHorizontal, Store, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Button, ChecklistProgressBar, Combobox, CountBadge, ENTITY_CARD_CLASS, EmptyState, IconChip, InlineError, PageHeader, PageNav,
  PANEL_CLASS, Skeleton, StatusChip, Switch, type DateRangeValue,
} from '../../../components';
import { runScores } from '../checklistCompliance';
import {
  useStoresQuery, useAssignableUsersQuery, useChecklistInstancesBoardQuery, useChecklistInstanceSummaryQuery,
} from '../hook';
import { useFormerPeopleNamesQuery } from '../former/useFormerPeopleNames';
import {
  formatDeadlineTime, instanceProgressStatus, VERIFICATION_STATUS_LABEL, VERIFICATION_CHIP,
  instanceProgressToneClass, isInstanceOverdue, isFlaggedAnswer, formatPeriodSpan } from '../checklistDisplay';
import { ChecklistComplianceQuickStats, type ComplianceQuickFilterKey, type ComplianceQuickFilterCounts } from './ChecklistComplianceQuickStats';
import { GroupByControl, type GroupBy } from '../../admin/analytics/GroupByControl';
import { ChecklistInstanceKpiSection } from '../../admin/analytics/ChecklistInstanceKpiSection';
import { endOfDay } from '../../../lib/dateRange';
import { useOrgToday } from '../useOrgToday';
import { windowLabel } from '../../scores/useScoreWindow';
import { CARD_PAD, FIELD_LABEL_CLASS } from '../../scores/controlStyles';
import { SectionHeader } from '../../scores/SectionHeader';
import { formatPct } from '../../../lib/percent';
import { ChecklistReportButton } from '../report/ChecklistReportButton';
import { ChecklistScoringGaps } from './ChecklistScoringGaps';
import type { ChecklistInstance, ChecklistInstanceStatus } from '../../../api/checklistInstances';

const STATUS_OPTIONS: { value: '' | ChecklistInstanceStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Not completed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'OVERDUE', label: 'Overdue' },
];

const FIELD_LABEL = FIELD_LABEL_CLASS;
const CONTROL_H = 'h-11 sm:h-9';

interface ComplianceRowProps {
  instance: ChecklistInstance;
  storeName: string | null;
  nameById: Map<string, string>;
  namesLoading: boolean;
}

const PERSON_TONE: Record<'flag' | 'done' | 'started' | 'idle' | 'covered', { icon: LucideIcon; tone: string }> = {
  covered: { icon: Check, tone: 'bg-text-muted' },
  flag: { icon: AlertTriangle, tone: 'bg-danger' },
  done: { icon: Check, tone: 'bg-success' },
  started: { icon: Clock, tone: 'bg-warning' },
  idle: { icon: Minus, tone: 'bg-text-light' },
};

const ComplianceRow = memo(({ instance, storeName, nameById, namesLoading }: ComplianceRowProps) => {
  const stats = useMemo(() => {
    let total = 0;
    let done = 0;
    let flagged = 0;
    const byPerson = new Map<string, { completed: number; flagged: number }>();
    for (const item of (instance.items ?? [])) {
      if (item.isNotApplicable) continue;
      total += 1;
      if (item.isDone) done += 1;
      const isFlagged = item.isDone && isFlaggedAnswer(item);
      if (isFlagged) flagged += 1;
      if (item.completedBy) {
        const entry = byPerson.get(item.completedBy) ?? { completed: 0, flagged: 0 };
        entry.completed += 1;
        if (isFlagged) entry.flagged += 1;
        byPerson.set(item.completedBy, entry);
      }
    }
    return { total, done, flagged, byPerson, progress: runScores(instance.items ?? []).completion };
  }, [instance.items]);

  const { total, done, flagged, byPerson, progress } = stats;
  const status = instanceProgressStatus(done, total);
  const complete = status === 'COMPLETED';
  const fillers = useMemo(
    () => [...byPerson.entries()].sort((a, b) => b[1].completed - a[1].completed).map(([id]) => nameById.get(id) ?? 'a teammate'),
    [byPerson, nameById],
  );
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
          <p className="t-card font-display font-bold leading-snug text-text line-clamp-2">{instance.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 t-meta font-display text-text-muted">
            {storeName && <span className="flex items-center gap-1"><Store size={11} aria-hidden /> {storeName}</span>}
            <span>{formatPeriodSpan(instance)}</span>
            {!complete && deadlineTime && <span>Due {deadlineTime}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconChip icon={verification.icon} tone={verification.tone} label={VERIFICATION_STATUS_LABEL[instance.verificationStatus]} />
          {overdue && <StatusChip status="overdue" />}
          {flagged > 0 && <IconChip icon={AlertTriangle} tone="bg-danger" label={`${flagged} flagged`} />}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ChecklistProgressBar done={progress} total={100} bare thin tone={overdue && !complete ? 'danger' : 'auto'} className="flex-1" />
        <span className="flex items-baseline gap-1.5 shrink-0 tabular-nums font-display">
          <span className={cn('t-card font-bold', instanceProgressToneClass(overdue, complete))}>{progress}%</span>
          <span className="t-meta font-medium text-text-muted">{done}/{total}</span>
        </span>
      </div>

      {(instance.assigneeIds ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-border/60">
          {(instance.assigneeIds ?? []).map(id => {
            const theirs = byPerson.get(id);
            const completedByThem = theirs?.completed ?? 0;
            const flaggedByThem = theirs?.flagged ?? 0;
            const covered = complete && completedByThem === 0;
            const look = PERSON_TONE[flaggedByThem > 0 ? 'flag' : covered ? 'covered' : total > 0 && completedByThem === total ? 'done' : completedByThem > 0 ? 'started' : 'idle'];
            const name = nameById.get(id) ?? (namesLoading ? '...' : 'Unknown');
            return (
              <IconChip
                key={id}
                icon={look.icon}
                tone={look.tone}
                label={covered ? `${name}, not needed` : `${name}, ${completedByThem}/${total}${flaggedByThem > 0 ? `, ${flaggedByThem} flagged` : ''}`}
                title={covered ? `Already completed by ${fillers.join(' and ')}. One person filling it covers everyone.` : undefined}
              />
            );
          })}
        </div>
      )}
    </Link>
  );
});
ComplianceRow.displayName = 'ComplianceRow';

const ComplianceRowSkeleton = () => (
  <div className={cn(PANEL_CLASS, 'flex min-h-36 flex-col gap-3', CARD_PAD)}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-2 flex-1">
        <Skeleton className="h-4 w-2/3 max-w-72" />
        <Skeleton className="h-3 w-1/2 max-w-56" />
      </div>
      <Skeleton className="h-7 w-24 rounded-full" />
    </div>
    <Skeleton className="h-1.5 w-full rounded-full" />
    <div className="flex gap-2 pt-3 border-t border-border/60">
      <Skeleton className="h-7 w-32 rounded-full" />
      <Skeleton className="h-7 w-28 rounded-full" />
    </div>
  </div>
);

const ActiveFilterChip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="flex h-8 items-center gap-1 rounded-full border border-border bg-surface-hover pl-3 pr-1 t-meta font-display font-medium text-text-secondary">
    {label}
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className="relative flex size-6 cursor-pointer items-center justify-center rounded-full text-text-muted outline-none transition-colors duration-150 hover:bg-surface-active hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5"
    >
      <X size={13} aria-hidden />
    </button>
  </span>
);

const shortDay = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const personName = (p: { firstName: string; lastName: string | null; email?: string }) =>
  `${p.firstName} ${p.lastName ?? ''}`.trim() || p.email || 'Unknown';

const PAGE_SIZE = 50;

const QUICK_TILE_LABEL: Record<Exclude<ComplianceQuickFilterKey, 'all'>, string> = {
  completed: 'Done',
  due: 'On track',
  overdue: 'Missed',
};

export const ChecklistComplianceBoard = () => {
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [range, setRangeState] = useState<DateRangeValue>({ from: null, to: null });
  const reportFrom = range.from ? range.from.toISOString() : undefined;
  const reportTo = range.to ? endOfDay(range.to).toISOString() : undefined;

  const [storeId, setStoreIdState] = useState('');
  const [assigneeId, setAssigneeIdState] = useState('');
  const [status, setStatusState] = useState<'' | ChecklistInstanceStatus>('');
  const [includeDeleted, setIncludeDeletedState] = useState(false);
  const [quickFilter, setQuickFilter] = useState<ComplianceQuickFilterKey>('all');
  const [page, setPage] = useState(1);

  const setStoreId = (value: string) => { setStoreIdState(value); setPage(1); };
  const setAssigneeId = (value: string) => { setAssigneeIdState(value); setPage(1); };
  const setStatus = (value: '' | ChecklistInstanceStatus) => {
    setStatusState(value);
    if (value) setQuickFilter('all');
    setPage(1);
  };
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
    const turnsOn = key !== 'all' && quickFilter !== key;
    setQuickFilter(turnsOn ? key : 'all');
    if (turnsOn) setStatusState('');
    setPage(1);
  };
  const hasFilters = !!(storeId || assigneeId || status || includeDeleted || range.from || range.to || quickFilter !== 'all');
  const filterCount = [storeId, assigneeId, status, includeDeleted, range.from || range.to].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const clearFilters = () => {
    setStoreIdState('');
    setAssigneeIdState('');
    setStatusState('');
    setIncludeDeletedState(false);
    setRangeState({ from: null, to: null });
    setQuickFilter('all');
    setPage(1);
  };

  const orgToday = useOrgToday();
  const listFrom = reportFrom ?? `${orgToday.slice(0, 8)}01`;
  const listTo = reportTo ?? orgToday;

  const { data: stores = [], isPending: storesPending } = useStoresQuery();
  const { data: people = [], isSuccess: peopleLoaded } = useAssignableUsersQuery(undefined, storeId || undefined);
  const { data: allPeople = [], isPending: allPeoplePending } = useAssignableUsersQuery();
  const { data: formerPeople = [], isPending: formerPending } = useFormerPeopleNamesQuery();

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPeople) map.set(p.id, personName(p));
    for (const p of formerPeople) map.set(p.id, `${personName(p)} (left)`);
    return map;
  }, [allPeople, formerPeople]);
  const storeNameById = useMemo(() => new Map(stores.map(s => [s.id, s.name])), [stores]);
  const namesLoading = allPeoplePending || formerPending;
  const scopeLabel = [assigneeId ? nameById.get(assigneeId) : undefined, storeId ? storeNameById.get(storeId) : undefined]
    .filter(Boolean)
    .join(', ');

  const storeOptions = useMemo(() => stores.map(s => ({ value: s.id, label: s.name })), [stores]);
  const personOptions = useMemo(
    () => [
      ...people.map(p => ({ value: p.id, label: personName(p) })),
      ...formerPeople.map(p => ({ value: p.id, label: `${personName(p)} (left)` })),
    ],
    [people, formerPeople],
  );

  if (assigneeId && storeId && peopleLoaded && !people.some(p => p.id === assigneeId) && !formerPeople.some(p => p.id === assigneeId)) {
    setAssigneeIdState('');
    setPage(1);
  }

  const effectiveStatus: ChecklistInstanceStatus | undefined =
    quickFilter === 'completed' ? 'COMPLETED'
    : quickFilter === 'due' ? 'DUE'
    : quickFilter === 'overdue' ? 'OVERDUE'
    : (status || undefined);

  const { data: instancePage, isPending, isError, isFetching, refetch } = useChecklistInstancesBoardQuery({
    storeId: storeId || undefined,
    assigneeId: assigneeId || undefined,
    status: effectiveStatus,
    from: listFrom,
    to: listTo,
    includeDeleted,
    page,
    limit: PAGE_SIZE,
  });
  const visibleInstances = instancePage?.data;
  const totalPages = instancePage?.meta.totalPages ?? 1;
  if (instancePage && page > totalPages) setPage(Math.max(1, totalPages));

  const { data: counts, isPending: summaryPending, isError: summaryError, refetch: refetchSummary } = useChecklistInstanceSummaryQuery({
    storeId: storeId || undefined,
    assigneeId: assigneeId || undefined,
    from: listFrom,
    to: listTo,
    includeDeleted,
  });
  const summary = useMemo<ComplianceQuickFilterCounts | undefined>(
    () => counts && { all: counts.total, completed: counts.completed, due: counts.due, overdue: counts.missed },
    [counts],
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        icon={ClipboardCheck}
        title="Checklist Compliance"
        subtitle="Completion and quality trends, plus who's filled their checklist and who hasn't."
        actions={<ChecklistReportButton />}
      />

      <section aria-label="Filters" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          <Button
            variant="outline"
            className={cn(CONTROL_H, 'gap-2 px-4')}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="compliance-filter-panel"
          >
            <SlidersHorizontal size={15} aria-hidden />
            Filters
            <CountBadge count={filterCount} label={`${filterCount} ${filterCount === 1 ? 'filter' : 'filters'} on`} />
            <ChevronDown size={15} aria-hidden className={cn('transition-transform duration-200 motion-reduce:transition-none', filtersOpen && 'rotate-180')} />
          </Button>

          {storeId && <ActiveFilterChip label={storeNameById.get(storeId) ?? 'Store'} onRemove={() => setStoreId('')} />}
          {assigneeId && <ActiveFilterChip label={nameById.get(assigneeId) ?? 'Person'} onRemove={() => setAssigneeId('')} />}
          {status && <ActiveFilterChip label={STATUS_OPTIONS.find((o) => o.value === status)?.label ?? 'Status'} onRemove={() => setStatus('')} />}
          {quickFilter !== 'all' && (
            <ActiveFilterChip label={QUICK_TILE_LABEL[quickFilter]} onRemove={() => toggleQuickFilter(quickFilter)} />
          )}
          {includeDeleted && <ActiveFilterChip label="Deleted checklists shown" onRemove={() => setIncludeDeleted(false)} />}
          {(range.from || range.to) && (
            <ActiveFilterChip
              label={range.from && range.to ? `${shortDay(range.from)} to ${shortDay(range.to)}` : range.from ? `From ${shortDay(range.from)}` : `Until ${shortDay(range.to!)}`}
              onRemove={() => setRange({ from: null, to: null })}
            />
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="relative h-8 cursor-pointer rounded-lg px-3 t-meta font-display font-medium text-text-muted outline-none transition-colors duration-150 hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5"
            >
              Clear all
            </button>
          )}
        </div>

        {filtersOpen && (
          <div id="compliance-filter-panel" className={cn(PANEL_CLASS, 'flex flex-col gap-4', CARD_PAD)}>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" className={cn(CONTROL_H, 'px-4')} onClick={setLastMonth}>
                Last month
              </Button>
              <GroupByControl groupBy={groupBy} onGroupByChange={setGroupBy} range={range} onRangeChange={setRange} />
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-border/60 pt-4">
              <div className="flex w-full flex-col gap-1.5 sm:w-52">
                <label htmlFor="compliance-store" className={FIELD_LABEL}>Store</label>
                <Combobox
                  id="compliance-store"
                  value={storeId}
                  onChange={setStoreId}
                  options={storeOptions}
                  emptyOptionLabel="All stores"
                  isLoading={storesPending}
                  className={cn(CONTROL_H, 'rounded-lg')}
                />
              </div>
              <div className="flex w-full flex-col gap-1.5 sm:w-52">
                <label htmlFor="compliance-person" className={FIELD_LABEL}>Person</label>
                <Combobox
                  id="compliance-person"
                  value={assigneeId}
                  onChange={setAssigneeId}
                  options={personOptions}
                  emptyOptionLabel="All people"
                  className={cn(CONTROL_H, 'rounded-lg')}
                />
              </div>
              <div className="flex flex-col gap-1.5 w-full sm:w-fit">
                <span id="compliance-status-label" className={FIELD_LABEL}>Status</span>
                <Tabs value={status} onValueChange={(v) => setStatus(v as '' | ChecklistInstanceStatus)}>
                  <TabsList aria-labelledby="compliance-status-label" className={cn(CONTROL_H, 'w-full sm:w-fit max-sm:grid max-sm:grid-cols-4 max-sm:h-auto')}>
                    {STATUS_OPTIONS.map(opt => (
                      <TabsTrigger key={opt.value || 'all'} value={opt.value} className="h-full min-h-11 px-1.5 text-xs leading-tight whitespace-normal sm:min-h-0">
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
                  'flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 t-meta font-display font-medium text-text-secondary transition-colors duration-150 hover:border-border-hover',
                )}
              >
                <Switch id="compliance-include-deleted" checked={includeDeleted} onChange={setIncludeDeleted} />
                Show deleted checklists
              </label>
            </div>
            <p className="t-meta font-display text-text-muted">
              Store, person and dates change the figures and the list. Status only changes the list.
            </p>
          </div>
        )}
      </section>

      <ChecklistScoringGaps />

      <ChecklistInstanceKpiSection
        groupBy={groupBy}
        from={reportFrom}
        to={reportTo}
        isOrgWideRole={false}
        linkCards={false}
        includeDeleted={includeDeleted}
        storeId={storeId || undefined}
        assigneeId={assigneeId || undefined}
        scopeLabel={scopeLabel || undefined}
      />

      <section aria-labelledby="compliance-runs-heading" className="flex flex-col gap-3 border-t border-border/60 pt-6">
        <SectionHeader id="compliance-runs-heading" title="Who's done what" />
        <ChecklistComplianceQuickStats
          counts={summary}
          active={quickFilter}
          onToggle={toggleQuickFilter}
          isLoading={summaryPending}
          isError={summaryError}
          onRetry={() => refetchSummary()}
        />
        {counts && (
          <div className="flex flex-col gap-1 t-meta font-display text-text-muted">
            <p>{windowLabel(counts.window.from, counts.window.to)}</p>
            <p>
              {counts.dueRuns > 0 && counts.completionPct !== null
                ? <><span className="font-semibold tabular-nums text-text">{formatPct(counts.completionPct)}</span> of the {counts.dueRuns} runs that came due were completed. On track runs are not in that number.</>
                : 'No run has come due in this period yet.'}
            </p>
            {counts.notCounted > 0 && (
              <p>{counts.notCounted} {counts.notCounted === 1 ? 'run is' : 'runs are'} not counted in Done, On track or Missed: no questions, not opened yet, or an idle holiday run. They still show in All runs and in the list.</p>
            )}
          </div>
        )}
      </section>

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
        <div className="flex flex-col gap-3" aria-busy={isFetching}>
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
