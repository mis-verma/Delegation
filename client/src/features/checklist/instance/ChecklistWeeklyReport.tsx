import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarCheck2, ChevronRight, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Combobox, EmptyState, ExportMenu, InlineError, PageHeader, PANEL_CLASS, PeriodStepper, Skeleton } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { formatPct } from '../../../lib/percent';
import { useStoresQuery, usePeriodReportQuery, useDepartmentScoresQuery } from '../hook';
import { useDepartmentsQuery } from '../../tickets/hook';
import { useAuth } from '../../../context/AuthContext';
import { WeeklyExportMenu } from './WeeklyExportMenu';
import { FillMatrix } from './FillMatrix';
import { ReportScoreboard, type ScoreboardItem } from './ReportScoreboard';
import { rankScoreboard } from './reportScoreboardRank';
import { rateToneClass } from '../checklistDisplay';
import { useOrgToday } from '../useOrgToday';
import { HowCalculated } from '../../scores/HowCalculated';
import { FIELD_LABEL_CLASS } from '../../scores/controlStyles';
import { SCORE_LABEL, complianceLabel } from '../../../lib/scoreLabels';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { PERIOD_LABEL, PERIODS, windowFor, type ScorePeriod } from '../../dashboard/scorePeriods';

type ReportView = 'checklists' | 'departments' | 'stores';
const VIEW_KEYS: readonly ReportView[] = ['checklists', 'departments', 'stores'];
const VIEW_LABELS: Record<ReportView, string> = { checklists: 'Checklists', departments: 'Departments', stores: 'Stores' };

const STRIP = cn(PANEL_CLASS, 'grid grid-cols-2 sm:grid-cols-4 gap-px bg-border overflow-hidden');

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
  const { user } = useAuth();
  const canPickDepartment = user?.role === 'ADMIN' || user?.role === 'PC';
  const { data: stores = [], isPending: storesPending } = useStoresQuery();
  const { data: departments = [], isPending: departmentsPending } = useDepartmentsQuery(canPickDepartment);
  const range = windowFor(period, offset, today);
  const appliedStoreId = view === 'stores' ? undefined : storeId || undefined;
  const appliedDepartmentId = canPickDepartment ? departmentId || undefined : undefined;
  const { data, isPending, isError, isPlaceholderData, refetch } = usePeriodReportQuery(range.from, range.to, appliedStoreId, appliedDepartmentId);

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
  const summaryTiles = useMemo(() => summary && [
    { label: SCORE_LABEL.completion, how: 'completion' as const, value: formatPct(summary.completion), tone: summary.completion === null ? '' : rateToneClass(summary.completion) },
    { label: SCORE_LABEL.metDeadline, how: 'metDeadline' as const, value: formatPct(summary.metDeadlinePct), tone: summary.metDeadlinePct === null ? '' : rateToneClass(summary.metDeadlinePct) },
    { label: SCORE_LABEL.onTime, how: 'onTime' as const, value: formatPct(summary.onTimeOfFinishedPct), tone: summary.onTimeOfFinishedPct === null ? '' : rateToneClass(summary.onTimeOfFinishedPct) },
    { label: complianceLabel('checklist'), how: 'compliance' as const, value: formatPct(summary.compliance), tone: summary.compliance === null ? '' : rateToneClass(summary.compliance) },
    { label: 'Filled on time', value: summary.onTime, tone: 'text-success' },
    { label: 'Filled late', value: summary.late, tone: summary.late ? 'text-warning' : '' },
    { label: 'Not filled', value: summary.missed, tone: summary.missed ? 'text-danger' : '' },
    ...(summary.open ? [{ label: 'Still open', value: summary.open, tone: 'text-text-secondary' }] : []),
  ], [summary]);

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
  const departmentName = canPickDepartment ? departments.find((d) => d.id === departmentId)?.name : undefined;

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader icon={CalendarCheck2} title="Report" subtitle="Checklist scores by checklist, department and store, with the winner for each week, month or year. Tickets and delegations are in Scores."
        actions={
          <>
            <Link viewTransition to="/admin/scores?view=checklist" className="inline-flex h-9 items-center rounded-lg border border-border px-3 t-meta font-display font-semibold text-text-secondary transition-colors hover:border-border-hover hover:text-text">Compare in Scores</Link>
            <Link viewTransition to={scoresMatrixHref} className="inline-flex h-9 items-center rounded-lg border border-border px-3 t-meta font-display font-semibold text-text-secondary transition-colors hover:border-border-hover hover:text-text">Fill matrix in Scores</Link>
          </>
        }
      />

      <div className="w-full sm:w-fit">
        <PeriodTabControl value={view} options={VIEW_KEYS} labels={VIEW_LABELS} onChange={setView} fill />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex w-full flex-col gap-3 sm:w-auto">
          <PeriodTabControl value={period} options={PERIODS} labels={PERIOD_LABEL} onChange={(next) => { setPeriod(next); setOffset(0); }} fill />
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
        <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
          {view !== 'stores' && (
          <div className="flex flex-col gap-1.5 flex-1 min-w-40 sm:flex-none sm:w-52">
            <label htmlFor="weekly-store" className={FIELD_LABEL_CLASS}>Store</label>
            <Combobox
              id="weekly-store"
              value={storeId}
              onChange={setStoreId}
              options={storeOptions}
              emptyOptionLabel="All stores"
              isLoading={storesPending}
              className="h-11 rounded-lg sm:h-9"
            />
          </div>
          )}
          {canPickDepartment && view !== 'departments' && (
            <div className="flex flex-col gap-1.5 flex-1 min-w-40 sm:flex-none sm:w-52">
              <label htmlFor="weekly-department" className={FIELD_LABEL_CLASS}>Department</label>
              <Combobox
                id="weekly-department"
                value={departmentId}
                onChange={setDepartmentId}
                options={departmentOptions}
                emptyOptionLabel="All departments"
                isLoading={departmentsPending}
                className="h-11 rounded-lg sm:h-9"
              />
            </div>
          )}
          {view === 'checklists' && <WeeklyExportMenu
            period={period}
            offset={offset}
            storeId={storeId || undefined}
            departmentId={canPickDepartment ? departmentId || undefined : undefined}
            storeName={stores.find(s => s.id === storeId)?.name}
            departmentName={canPickDepartment ? departments.find(d => d.id === departmentId)?.name : user?.role ? 'your department' : undefined}
          />}
          {view !== 'checklists' && (
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
              className="h-11 rounded-lg sm:h-9"
            />
          )}
        </div>
      </div>

      <p className="t-meta font-display text-text-muted">
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
          {summary && summary.due + (summary.open ?? 0) > 0 && (
            <dl className={STRIP}>
              {summaryTiles?.map(t => (
                <div key={t.label} className="flex flex-col gap-0.5 bg-surface p-3">
                  <dt className="flex items-center gap-0.5 t-meta font-display text-text-muted">{t.label}{t.how && <HowCalculated figure={t.how} module="checklist" />}</dt>
                  <dd className={cn('t-stat font-display tabular-nums text-text', t.tone)}>{t.value}</dd>
                </div>
              ))}
            </dl>
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
                Completion is the share of due checklists that got filled, on time or late. It counts whole checklists, not questions. Met deadline is the share of due checklists filled before their cutoff, so late and not-filled ones both count against it. On time (of finished) is the share of filled checklists that were filled before their cutoff. Answers right is how well the checked answers were answered, with critical questions counted twice and sent-back ones counted as failed.
              </p>
            </details>
          )}

          <FillMatrix data={data} today={today} label={range.label} />

          {isPlaceholderData && (
            <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These figures are for the previous period until {range.label} loads.</p>
          )}
        </div>
      )}
    </div>
  );
};
