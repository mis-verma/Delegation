import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { PageNav } from '../../../components';
import { Link } from 'react-router';
import { Store, AlertCircle, SearchX, SlidersHorizontal } from 'lucide-react';
import { Skeleton, SelectDropdown, StatusChip, EmptyState, type DateRangeValue } from '../../../components';
import { Badge } from '@/components/ui/badge';
import { useStoresQuery, useAssignableUsersQuery, useChecklistInstancesBoardQuery, useChecklistInstanceSummaryQuery } from '../hook';
import {
  formatDate, formatDeadlineTime, instanceProgressStatus, VERIFICATION_STATUS_LABEL, VERIFICATION_BADGE_VARIANT,
  instanceProgressToneClass, instanceProgressBarClass, isInstanceOverdue,
} from '../checklistDisplay';
import { ChecklistComplianceQuickStats, type ComplianceQuickFilterKey } from './ChecklistComplianceQuickStats';
import { GroupByControl, type GroupBy } from '../../admin/analytics/GroupByControl';
import { ChecklistInstanceKpiSection } from '../../admin/analytics/ChecklistInstanceKpiSection';
import { endOfDay } from '../../../lib/dateRange';
import type { ChecklistInstance, ChecklistInstanceStatus } from '../../../api/checklistInstances';

const STATUS_OPTIONS: { value: '' | ChecklistInstanceStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Not completed' },
  { value: 'COMPLETED', label: 'Completed' },
];

interface ComplianceRowProps {
  instance: ChecklistInstance;
  storeName: string;
  nameById: Map<string, string>;
}

// One instance's roll-up: overall progress, plus a per-assignee breakdown of how many of this
// shared instance's items *that specific person* personally completed (via each item's
// completedBy) — the closest honest signal this schema supports for "did this person do their
// part," since items are completable by any assignee, not owned individually.
const ComplianceRow = ({ instance, storeName, nameById }: ComplianceRowProps) => {
  const total = instance.items.length;
  const done = instance.items.filter(i => i.isDone).length;
  const status = instanceProgressStatus(done, total);
  const progress = total ? Math.round((done / total) * 100) : 0;
  const overdue = isInstanceOverdue(instance, status === 'COMPLETED');
  const deadlineTime = formatDeadlineTime(instance);

  return (
    <Link
      to={`/checklists/${instance.id}`}
      className="flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface hover:border-border-hover transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-display font-bold text-text truncate">{instance.title}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-text-muted font-display flex-wrap">
            <span className="flex items-center gap-1"><Store size={11} /> {storeName}</span>
            <span>{formatDate(instance.periodStart)} – {formatDate(instance.periodEnd)}</span>
            {status !== 'COMPLETED' && deadlineTime && <span>· Due {deadlineTime}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={VERIFICATION_BADGE_VARIANT[instance.verificationStatus]}>
            {VERIFICATION_STATUS_LABEL[instance.verificationStatus]}
          </Badge>
          {overdue && <StatusChip status="overdue" />}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 bg-surface-hover rounded-full overflow-hidden border border-border/50">
          <div
            className={`h-full rounded-full transition-all duration-500 ${instanceProgressBarClass(overdue, status === 'COMPLETED')}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={`text-xs font-display font-medium shrink-0 ${instanceProgressToneClass(overdue, status === 'COMPLETED')}`}>{done}/{total}</span>
      </div>

      {instance.assigneeIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-dashed border-border/60">
          {instance.assigneeIds.map(id => {
            const completedByThem = instance.items.filter(i => i.completedBy === id).length;
            const allDone = total > 0 && completedByThem === total;
            const started = completedByThem > 0;
            return (
              <Badge
                key={id}
                variant={allDone ? 'success' : started ? 'warning' : 'neutral'}
                className={`text-[11px] ${allDone ? 'bg-success/10' : started ? 'bg-warning/10' : 'bg-surface-hover'}`}
              >
                {nameById.get(id) ?? 'Unknown'} · {completedByThem}/{total}
              </Badge>
            );
          })}
        </div>
      )}
    </Link>
  );
};

// Admin-only dashboard answering "who has/hasn't filled their checklist" — dynamically filterable
// by store and by person. Spans every checklist definition's generated instances (unlike
// ChecklistDefinitionDetail, which only shows instances for one definition at a time).
// The board spans every store org-wide, so it's the one list here that realistically reaches
// thousands of rows. 50 keeps the window virtualizer's job small and the hydration bounded.
const PAGE_SIZE = 50;

export const ChecklistComplianceBoard = () => {
  // Trend + rate-tile report, same component the Overview page's own Audits tab uses — reused
  // (not rebuilt) so this page reads as a report at a glance instead of opening straight onto the
  // per-instance/per-person list below, which on its own just looks like a roster of checklists
  // and people rather than anything you'd call "compliance reporting."
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [range, setRangeState] = useState<DateRangeValue>({ from: null, to: null });
  const reportFrom = range.from ? range.from.toISOString() : undefined;
  const reportTo = range.to ? endOfDay(range.to).toISOString() : undefined;

  const [storeId, setStoreIdState] = useState('');
  const [assigneeId, setAssigneeIdState] = useState('');
  const [status, setStatusState] = useState<'' | ChecklistInstanceStatus>('');
  // Layered on top of the store/person/status filters above, same as TicketList's quickFilter —
  // click a tile to narrow the list further, click it again (or "Instances") to clear.
  const [quickFilter, setQuickFilter] = useState<ComplianceQuickFilterKey>('all');
  const [page, setPage] = useState(1);

  // Every filter resets the page, because page 4 of the old result set is meaningless against the
  // new one and usually past its end. Done in the setters rather than an effect watching them —
  // an effect would render the stale page once before correcting itself.
  const setStoreId = (value: string) => { setStoreIdState(value); setPage(1); };
  const setAssigneeId = (value: string) => { setAssigneeIdState(value); setPage(1); };
  const setStatus = (value: '' | ChecklistInstanceStatus) => { setStatusState(value); setPage(1); };
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

  const { data: stores = [] } = useStoresQuery();
  // Scoped to the selected store, for the Person filter's own option list.
  const { data: people = [] } = useAssignableUsersQuery(undefined, storeId || undefined);
  // Unscoped roster so assignee chips resolve to real names even for instances outside whichever
  // store is currently selected in the filter above.
  const { data: allPeople = [] } = useAssignableUsersQuery();

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPeople) map.set(p.id, `${p.firstName} ${p.lastName ?? ''}`.trim() || p.email);
    return map;
  }, [allPeople]);
  const storeNameById = useMemo(() => new Map(stores.map(s => [s.id, s.name])), [stores]);

  // The tile and the Status dropdown narrow the same dimension, so they resolve to one server
  // `status` — the tile wins when set. All of this used to be a client-side pass over the full
  // list, which is why the endpoint had to return every matching instance.
  const effectiveStatus: ChecklistInstanceStatus | undefined =
    quickFilter === 'completed' ? 'COMPLETED'
    : quickFilter === 'pending' ? 'OPEN'
    : quickFilter === 'overdue' ? 'OVERDUE'
    : (status || undefined);

  const { data: instancePage, isPending, isError, refetch } = useChecklistInstancesBoardQuery({
    storeId: storeId || undefined,
    assigneeId: assigneeId || undefined,
    status: effectiveStatus,
    from: reportFrom,
    to: reportTo,
    page,
    limit: PAGE_SIZE,
  });
  const visibleInstances = instancePage?.data ?? [];
  const totalPages = instancePage?.meta.totalPages ?? 1;

  // Counted by the database rather than by reducing the fetched page. These four numbers were the
  // reason this endpoint had to return every matching instance: a tile that says "23" derived from
  // `instances.length` silently becomes the page size the moment the list paginates. With them
  // coming from /summary, the list below is free to page without the tiles lying.
  const { data: counts } = useChecklistInstanceSummaryQuery({
    storeId: storeId || undefined,
    assigneeId: assigneeId || undefined,
    from: reportFrom,
    to: reportTo,
  });
  const summary: Record<ComplianceQuickFilterKey, number> = {
    all: counts?.total ?? 0,
    completed: counts?.completed ?? 0,
    pending: counts?.pending ?? 0,
    overdue: counts?.overdue ?? 0,
  };

  // This board spans every store's checklist instances org-wide (unlike the per-user MyChecklists
  // page), so it's the one list here that can realistically reach hundreds of rows. Windowed
  // instead of a fixed-height inner scroll container since the list scrolls with the page itself —
  // row height varies (the assignee-chip row wraps differently per instance), hence
  // `measureElement` rather than a fixed estimateSize.
  const listRef = useRef<HTMLDivElement>(null);
  // Reading listRef.current directly in the hook call (the pattern TanStack Virtual's own docs
  // show) trips React's "no ref reads during render" rule — measuring in a layout effect instead
  // keeps the ref read out of render entirely.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop ?? 0);
  }, []);
  const rowVirtualizer = useWindowVirtualizer({
    count: visibleInstances.length,
    estimateSize: () => 132,
    overscan: 6,
    scrollMargin,
  });

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">Checklist Compliance</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Completion and quality trends, plus who's filled their checklist and who hasn't.
        </p>
      </div>

      {/* One filter panel for the whole page — date range/grouping used to float in the page
          header while store/person/status sat unboxed further down, two disconnected-looking
          control clusters even though both now scope the same data. Everything that narrows
          what's shown below lives here now. */}
      <div className="flex flex-col gap-4 p-4 sm:p-5 rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center p-1 rounded-md bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 shrink-0">
            <SlidersHorizontal size={13} />
          </span>
          <span className="text-xs font-display font-bold text-text">Filters</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={setLastMonth}
            className="h-9 px-3 rounded-lg text-xs font-display font-semibold border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-primary-600 hover:border-primary-200 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            Last month
          </button>
          <GroupByControl groupBy={groupBy} onGroupByChange={setGroupBy} range={range} onRangeChange={setRange} />
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-dashed border-border/60">
          <div className="flex flex-col gap-1.5 w-full sm:w-48">
            <label className="text-xs font-display font-medium text-text-secondary">Store</label>
            <SelectDropdown
              value={storeId}
              onChange={setStoreId}
              options={[{ value: '', label: 'All stores' }, ...stores.map(s => ({ value: s.id, label: s.name }))]}
              aria-label="Filter by store"
            />
          </div>
          <div className="flex flex-col gap-1.5 w-full sm:w-48">
            <label className="text-xs font-display font-medium text-text-secondary">Person</label>
            <SelectDropdown
              value={assigneeId}
              onChange={setAssigneeId}
              options={[
                { value: '', label: 'All people' },
                ...people.map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName ?? ''}`.trim() })),
              ]}
              aria-label="Filter by person"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-display font-medium text-text-secondary">Status</label>
            <div className="flex items-center gap-1 h-11 p-1 rounded-full border border-border bg-surface">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  aria-pressed={status === opt.value}
                  className={`px-3 py-1.5 rounded-full text-xs font-display font-medium transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                    status === opt.value ? 'bg-primary-700 text-white shadow-sm' : 'text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* isOrgWideRole=false here on purpose — these cards' click destination on the Overview page
          is this exact page, so on this page itself there's nowhere further to send a click; the
          real per-instance rows they'd otherwise link to already render directly below. */}
      <ChecklistInstanceKpiSection groupBy={groupBy} from={reportFrom} to={reportTo} isOrgWideRole={false} />

      <div className="flex items-center gap-3 pt-2 border-t border-border/60">
        <h2 className="text-sm font-display font-bold text-text shrink-0">Who's done what</h2>
        <p className="text-xs font-display text-text-muted">Reflects the filters above.</p>
      </div>

      <ChecklistComplianceQuickStats counts={summary} active={quickFilter} onToggle={toggleQuickFilter} isLoading={isPending} />

      {isPending && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/10 text-danger text-sm font-display">
          <AlertCircle size={15} />
          <span className="flex-1">We couldn't load this data. Try again.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            Retry
          </button>
        </div>
      )}

      {!isPending && !isError && visibleInstances.length === 0 && (
        <EmptyState size="compact" icon={SearchX} title="Nothing matches these filters." />
      )}

      {visibleInstances.length > 0 && (
        <div ref={listRef} className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const instance = visibleInstances[virtualRow.index];
            return (
              <div
                key={instance.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute top-0 left-0 w-full pb-3"
                style={{ transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)` }}
              >
                <ComplianceRow
                  instance={instance}
                  storeName={storeNameById.get(instance.storeId) ?? 'Unknown store'}
                  nameById={nameById}
                />
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <PageNav page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
};
