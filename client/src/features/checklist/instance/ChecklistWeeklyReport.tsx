import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BarChart3, Building2, CalendarCheck2, CalendarRange, ChevronRight, Grid3x3, ListChecks, MoreHorizontal, SearchX, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Combobox, Dropdown, EmptyState, ExportMenu, InlineError, PageHeader, PANEL_CLASS, PeriodStepper, SelectDropdown, Skeleton, SlidingTabs, type SlidingTabOption } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { formatPct } from '../../../lib/percent';
import { useStoresQuery, usePeriodReportQuery, useDepartmentScoresQuery } from '../hook';
import { useDepartmentsQuery } from '../../tickets/hook';
import { useAuth } from '../../../context/AuthContext';
import { WeeklyExportMenu } from './WeeklyExportMenu';
import { FillMatrix } from './FillMatrix';
import { FillChecklistCards } from './FillChecklistCards';
import { FILL_VIEWS, FILL_VIEW_OPTIONS, type FillView } from './fillView';
import { useStoredChoice } from '../../../lib/useStoredChoice';
import { fillMatrixRows } from './fillMatrixState';
import { ChecklistPeriodReport } from './ChecklistPeriodReport';
import { ReportScoreboard, type ScoreboardItem } from './ReportScoreboard';
import { rankScoreboard } from './reportScoreboardRank';
import { useOrgToday } from '../useOrgToday';
import { StatusFigureStats, type StatusFigureItem } from '../../dashboard/StatusFigureStats';
import { fillKind } from './fillCount';
import { SCORE_LABEL, complianceLabel } from '../../../lib/scoreLabels';
import { PERIOD_LABEL, PERIODS, windowFor, type ScorePeriod } from '../../dashboard/scorePeriods';

type ReportView = 'checklists' | 'departments' | 'stores' | 'periods';
const VIEW_OPTIONS: SlidingTabOption<ReportView>[] = [
  { value: 'checklists', label: 'Checklists', icon: ListChecks },
  { value: 'departments', label: 'Departments', shortLabel: 'Depts', icon: Building2 },
  { value: 'stores', label: 'Stores', icon: Store },
  { value: 'periods', label: 'Week to year', shortLabel: 'Trend', icon: CalendarRange },
];
const PERIOD_OPTIONS = PERIODS.map((value) => ({ value, label: PERIOD_LABEL[value] }));

const STRIP = cn(PANEL_CLASS, 'grid grid-cols-2 sm:grid-cols-4 gap-px bg-border overflow-hidden');

type SummaryKey = 'completion' | 'metDeadline' | 'onTime' | 'compliance' | 'filledOnTime' | 'filledLate' | 'missed' | 'open';

const ReportSkeleton = () => (
  <>
    <div className={STRIP}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 bg-surface p-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </div>
    <div className={cn(PANEL_CLASS, 'flex flex-col min-h-64 overflow-hidden')}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Skeleton className="h-3 w-24 flex-1 max-w-48" />
        <Skeleton className="h-8 w-52 hidden sm:block" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2 min-h-14 border-b border-border/60 last:border-0">
          <div className="flex flex-col gap-1.5 flex-1 max-w-48">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            {Array.from({ length: 7 }).map((_, d) => <Skeleton key={d} className="size-7 rounded-full" />)}
          </div>
        </div>
      ))}
    </div>
  </>
);

export const ChecklistWeeklyReport = () => {
  const today = useOrgToday();
  const [urlParams] = useSearchParams();
  const [period, setPeriod] = useState<ScorePeriod>(() => {
    const p = urlParams.get('period');
    return PERIODS.find((x) => x === p) ?? 'week';
  });
  const [offset, setOffset] = useState(() => {
    const n = Number(urlParams.get('offset'));
    return Number.isInteger(n) && n <= 0 && n > -1000 ? n : 0;
  });
  const [storeId, setStoreId] = useState(() => urlParams.get('storeId') ?? '');
  const [departmentId, setDepartmentId] = useState(() => urlParams.get('departmentId') ?? '');
  const [view, setView] = useState<ReportView>('checklists');
  const [fillView, setFillView] = useStoredChoice<FillView>('fill-checklist-view', FILL_VIEWS, 'cards');
  const { user } = useAuth();
  const canPickDepartment = user?.role === 'ADMIN' || user?.role === 'PC';
  const { data: stores = [], isPending: storesPending } = useStoresQuery();
  const { data: departments = [], isPending: departmentsPending } = useDepartmentsQuery(canPickDepartment);
  const range = windowFor(period, offset, today);
  const appliedStoreId = view === 'stores' ? undefined : storeId || undefined;
  const appliedDepartmentId = canPickDepartment ? departmentId || undefined : undefined;
  const { data, isPending, isError, isPlaceholderData, refetch } = usePeriodReportQuery(range.from, range.to, appliedStoreId, appliedDepartmentId, view !== 'periods');

  const departmentScores = useDepartmentScoresQuery(range.from, range.to, storeId || undefined, view === 'departments');
  const departmentItems = useMemo<ScoreboardItem[] | undefined>(
    () => departmentScores.data?.map(d => ({ id: d.departmentId, name: d.departmentName, due: d.due, completed: d.completed, missed: d.missed, open: d.open ?? 0, completion: d.completion, compliance: d.compliance, rankable: d.rankable })),
    [departmentScores.data],
  );
  const storeItems = useMemo<ScoreboardItem[] | undefined>(
    () => data?.byStore.map(s => ({ id: s.storeId, name: s.storeName, due: s.due, completed: s.completed, missed: s.missed, open: s.open ?? 0, completion: s.completion, compliance: s.compliance, rankable: s.rankable })),
    [data],
  );
  const openStore = (id: string) => { setStoreId(id); setView('checklists'); };
  const openDepartment = (id: string) => { if (canPickDepartment) setDepartmentId(id); setView('checklists'); };

  const storeOptions = useMemo(() => stores.map(s => ({ value: s.id, label: s.name })), [stores]);
  const departmentOptions = useMemo(() => departments.map(d => ({ value: d.id, label: d.name })), [departments]);

  const rows = data?.rows;
  const summary = data?.summary;
  const summaryCards = useMemo(() => {
    if (!summary) return null;
    const items: StatusFigureItem<SummaryKey>[] = [
      { key: 'completion', kind: fillKind(summary.completion), label: SCORE_LABEL.completion, short: 'Filled', help: 'Due checklists that got filled, on time or late' },
      { key: 'metDeadline', kind: fillKind(summary.metDeadlinePct), label: SCORE_LABEL.metDeadline, short: 'Deadline', help: 'Days filled before the cutoff out of days due' },
      { key: 'onTime', kind: fillKind(summary.onTimeOfFinishedPct), label: SCORE_LABEL.onTime, short: 'On time', help: 'Filled checklists that were filled before their cutoff' },
      { key: 'compliance', kind: fillKind(summary.compliance), label: complianceLabel('checklist'), short: 'Right', help: 'Good answers out of checked answers' },
      { key: 'filledOnTime', kind: 'completed', label: 'Filled on time', short: 'On time', help: 'Checklists filled before their cutoff' },
      { key: 'filledLate', kind: 'due', label: 'Filled late', short: 'Late', help: 'Checklists filled after their cutoff' },
      { key: 'missed', kind: 'late', label: 'Not filled', short: 'Missed', help: 'Checklists that closed without being filled' },
      ...(summary.open ? [{ key: 'open' as const, kind: 'pending' as const, label: 'Still open', short: 'Open', help: 'Not counted in the percentages until filled or closed' }] : []),
    ];
    const pctKeys = { completion: summary.completion, metDeadline: summary.metDeadlinePct, onTime: summary.onTimeOfFinishedPct, compliance: summary.compliance };
    return {
      items,
      counts: {
        ...Object.fromEntries(Object.entries(pctKeys).map(([k, v]) => [k, Math.round(v ?? 0)])),
        filledOnTime: summary.onTime,
        filledLate: summary.late,
        missed: summary.missed,
        open: summary.open ?? 0,
      } as Record<SummaryKey, number>,
      display: Object.fromEntries(Object.entries(pctKeys).map(([k, v]) => [k, formatPct(v)])) as Partial<Record<SummaryKey, string>>,
    };
  }, [summary]);

  const periodWord = PERIOD_LABEL[period].toLowerCase();
  const emptyAction = storeId || departmentId
    ? { label: 'Clear filters', onClick: () => { setStoreId(''); setDepartmentId(''); } }
    : offset !== 0
      ? { label: `Go to this ${periodWord}`, onClick: () => setOffset(0) }
      : undefined;

  const boardItems = view === 'departments' ? departmentItems : storeItems;
  const exportBoard = (): TableRows => {
    const { ranked, winner, rankOf } = rankScoreboard(boardItems);
    const winners = new Set(winner.map((w) => w.id));
    return [
      ['Rank', view === 'departments' ? 'Department' : 'Store', 'Checklist score %', 'Completion %', 'Answers right %', 'Due', 'Filled', 'Not filled', 'Still open', 'Too few runs to rank', 'Winner'],
      ...ranked.map((i, idx) => [rankOf(i, idx), i.name, exportPct(i.score), exportPct(i.completion), exportPct(i.compliance), i.due, i.completed, i.missed, i.open, i.rankable ? '' : 'Yes', winners.has(i.id) ? 'Yes' : '']),
    ];
  };
  const scoresMatrixHref = `/admin/scores?${new URLSearchParams({ view: 'checklist', matrix: '1', from: range.from, to: range.to, ...(appliedStoreId ? { store: appliedStoreId } : {}), ...(appliedDepartmentId ? { dept: appliedDepartmentId } : {}) }).toString()}`;
  const storeName = stores.find((s) => s.id === storeId)?.name;
  const showStoreFilter = view !== 'stores';
  const showDepartmentFilter = canPickDepartment && view !== 'departments';
  const departmentName = canPickDepartment ? departments.find((d) => d.id === departmentId)?.name : undefined;

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader icon={CalendarCheck2} title="Report" subtitle="Checklist scores by checklist, department and store, with the winner for each week, month or year. Tickets and delegations are in Scores." />

      <section aria-label="Report controls" className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3 sm:p-4')}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SlidingTabs label="Report view" value={view} options={VIEW_OPTIONS} onChange={setView} size="sm" fill="phone" className="max-sm:w-full" />
          <div className="flex items-center gap-2 max-sm:w-full">
            {view === 'checklists' && (
              <WeeklyExportMenu
                period={period}
                offset={offset}
                storeId={storeId || undefined}
                departmentId={appliedDepartmentId}
                storeName={storeName}
                departmentName={canPickDepartment ? departmentName : user?.role ? 'your department' : undefined}
              />
            )}
            {(view === 'departments' || view === 'stores') && (
              <ExportMenu
                disabled={!boardItems?.length}
                aria-label={`Export the ${view} scoreboard`}
                filename={`report-${view}`}
                sheetName="Report"
                title={exportTitle({
                  what: `Report, ${view === 'departments' ? 'Departments' : 'Stores'}`,
                  from: range.from,
                  to: range.to,
                  period: range.label,
                  filters: view === 'departments' ? { Store: storeName } : { Department: departmentName },
                })}
                getRows={exportBoard}
                className="h-11 rounded-xl"
              />
            )}
            <Dropdown
              title="Open in Scores"
              items={[
                { label: 'Compare in Scores', icon: BarChart3, to: '/admin/scores?view=checklist' },
                { label: 'Fill matrix in Scores', icon: Grid3x3, to: scoresMatrixHref },
              ]}
              trigger={
                <button type="button" aria-label="More options" className="ml-auto flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border/60 bg-surface text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:ml-0">
                  <MoreHorizontal className="size-5" aria-hidden="true" />
                </button>
              }
            />
          </div>
        </div>

        <div className={cn('flex flex-col gap-2 border-t border-border/50 pt-3 lg:flex-row lg:items-center lg:justify-between', view === 'periods' && 'lg:justify-end')}>
          {view !== 'periods' && (
            <div className="flex items-center gap-2">
              <div className="w-28 shrink-0">
                <SelectDropdown aria-label="Period" label="Period" value={period} options={PERIOD_OPTIONS} onChange={(next) => { setPeriod(next); setOffset(0); }} />
              </div>
              <PeriodStepper
                label={range.label}
                onPrev={() => setOffset((o) => o - 1)}
                onNext={() => setOffset((o) => Math.min(0, o + 1))}
                nextDisabled={offset >= 0}
                prevLabel={`Previous ${periodWord}`}
                nextLabel={`Next ${periodWord}`}
                todayLabel={offset !== 0 ? `This ${periodWord}` : undefined}
                onToday={() => setOffset(0)}
              />
            </div>
          )}
          {(showStoreFilter || showDepartmentFilter) && (
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {showStoreFilter && (
                <div className={cn('min-w-0 sm:w-52', !showDepartmentFilter && 'col-span-2')}>
                  <Combobox id="weekly-store" label="Store" value={storeId} onChange={setStoreId} options={storeOptions} emptyOptionLabel="All stores" placeholder="All stores" isLoading={storesPending} />
                </div>
              )}
              {showDepartmentFilter && (
                <div className={cn('min-w-0 sm:w-52', !showStoreFilter && 'col-span-2')}>
                  <Combobox id="weekly-department" label="Department" value={departmentId} onChange={setDepartmentId} options={departmentOptions} emptyOptionLabel="All departments" placeholder="All departments" isLoading={departmentsPending} />
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {view === 'periods' && (
        <ChecklistPeriodReport
          storeId={storeId || undefined}
          departmentId={appliedDepartmentId}
          storeName={storeName}
          departmentName={departmentName}
        />
      )}

      <p className={cn('t-meta font-display text-text-muted', view === 'periods' && 'hidden')}>
        {range.label}: {view === 'stores' ? 'every store' : storeName ?? 'all stores'}, {view === 'departments' ? (canPickDepartment ? 'every department' : 'your department') : canPickDepartment ? departmentName ?? 'all departments' : 'your department'}.
      </p>

      {view === 'departments' && (
        <ReportScoreboard noun="department" items={departmentItems} loading={departmentScores.isPending} error={departmentScores.isError} onRetry={() => void departmentScores.refetch()} updating={departmentScores.isPlaceholderData} windowLabel={range.label} onOpen={openDepartment} />
      )}

      {view === 'stores' && (
        <ReportScoreboard noun="store" items={storeItems} loading={isPending} error={isError} onRetry={() => void refetch()} updating={isPlaceholderData} windowLabel={range.label} onOpen={openStore} />
      )}

      {view === 'checklists' && isPending && <ReportSkeleton />}

      {view === 'checklists' && isError && <InlineError message="We couldn't load the report. Check your connection and try again." onRetry={() => refetch()} />}

      {view === 'checklists' && !isPending && !isError && rows?.length === 0 && (
        <EmptyState icon={SearchX} title={`No daily checklists in this ${periodWord}`} description="Try another period, store or department." action={emptyAction} />
      )}

      {view === 'checklists' && data && !!rows?.length && (
        <div className="flex flex-col gap-3" aria-busy={isPlaceholderData}>
          {summaryCards && summary && summary.due + (summary.open ?? 0) > 0 && (
            <StatusFigureStats label="Checklist fill summary" items={summaryCards.items} counts={summaryCards.counts} display={summaryCards.display} />
          )}
          {summary && summary.due + (summary.open ?? 0) === 0 && (
            <p className="t-meta font-display text-text-muted">
              Nothing was due in this {periodWord} yet.
            </p>
          )}
          {!!summary?.open && (
            <p role="status" className="t-meta font-display font-medium text-text-secondary">
              {summary.open} checklist{summary.open === 1 ? ' is' : 's are'} still open and not in these percentages yet. An open checklist counts once its cutoff passes or it is filled.
            </p>
          )}
          {summary && summary.due + (summary.open ?? 0) > 0 && (
            <details className="group t-meta font-display text-text-muted">
              <summary className="inline-flex items-center gap-1 min-h-9 pointer-coarse:min-h-11 cursor-pointer select-none font-semibold text-text-secondary hover:text-text list-none [&::-webkit-details-marker]:hidden">
                How these figures are counted
                <ChevronRight className="size-3.5 transition-transform duration-200 group-open:rotate-90" aria-hidden />
              </summary>
              <p className="pb-1 leading-relaxed">
                Completion in the tiles is the share of due checklists that got filled, on time or late. It counts whole checklists. In the table, Questions done counts questions instead: a checklist with 8 questions due on 6 days has 48 questions due, and the count shows how many were answered. Only checklists whose cutoff has passed or that are filled are counted; open ones show as +open. Met deadline is days filled before the cutoff out of days due, so late and not-filled days both count against it. On time (of finished) is the share of filled checklists that were filled before their cutoff. Answers right is good answers out of checked answers, with critical questions counted twice and sent-back ones counted as failed.
              </p>
            </details>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="t-meta font-display font-semibold text-text-secondary">{rows.length} {rows.length === 1 ? 'checklist' : 'checklists'}</p>
            <div className="flex items-center gap-2">
              <SlidingTabs label="View" value={fillView} options={FILL_VIEW_OPTIONS} onChange={setFillView} size="sm" />
              <ExportMenu
                disabled={!rows?.length}
                aria-label="Export the fill table"
                filename="checklist-fill"
                sheetName="Fill"
                title={exportTitle({ what: 'Checklist fill', from: range.from, to: range.to, period: range.label, filters: { Store: storeName, Department: departmentName } })}
                getRows={() => fillMatrixRows(data)}
                className="h-11 rounded-lg sm:h-9"
              />
            </div>
          </div>

          {fillView === 'cards' ? (
            <FillChecklistCards data={data} />
          ) : (
            <>
              <p className="t-meta font-display text-text-muted">Each row shows questions answered, days that met the deadline and answers right, with the counts behind each %.</p>
              <FillMatrix data={data} today={today} label={range.label} />
            </>
          )}

          {isPlaceholderData && (
            <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These figures are for the previous period until {range.label} loads.</p>
          )}
        </div>
      )}
    </div>
  );
};
