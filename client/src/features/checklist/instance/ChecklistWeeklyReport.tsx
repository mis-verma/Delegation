import { memo, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Link, useSearchParams } from 'react-router';
import { Building2, CalendarCheck2, CalendarOff, Check, ChevronLeft, ChevronRight, Clock, ListChecks, Minus, SearchX, Store, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Combobox, EmptyState, ExportMenu, InlineError, PageHeader, PANEL_CLASS, Skeleton } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { formatPct } from '../../../lib/percent';
import { useStoresQuery, usePeriodReportQuery, useDepartmentScoresQuery } from '../hook';
import { useDepartmentsQuery } from '../../tickets/hook';
import { useAuth } from '../../../context/AuthContext';
import { WeeklyExportMenu } from './WeeklyExportMenu';
import { ReportScoreboard, type ScoreboardItem } from './ReportScoreboard';
import { rankScoreboard } from './reportScoreboardRank';
import { rateToneClass } from '../checklistDisplay';
import { useOrgToday } from '../useOrgToday';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { PERIOD_LABEL, PERIODS, windowFor, type ScorePeriod } from '../../dashboard/scorePeriods';
import type { WeeklyCell, WeeklyCellState, WeeklyReport } from '../../../api/checklistInstances';

type WeeklyReportRow = WeeklyReport['rows'][number];

type ReportView = 'checklists' | 'departments' | 'stores';
const VIEWS: { key: ReportView; label: string; icon: typeof Store }[] = [
  { key: 'checklists', label: 'Checklists', icon: ListChecks },
  { key: 'departments', label: 'Departments', icon: Building2 },
  { key: 'stores', label: 'Stores', icon: Store },
];

// Indexed by getUTCDay(), so Sunday is first.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Hoisted: building an Intl formatter is the expensive part, and every cell label formats a date.
const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

const shortDate = (date: string) => SHORT_DATE.format(new Date(`${date}T00:00:00Z`));

// One look per state. Colour is never the only signal: each carries its own mark and a word in the
// tooltip / screen-reader label.
const STATE: Record<WeeklyCellState, { label: string; tone: string; icon: typeof Check | null }> = {
  done: { label: 'Filled on time', tone: 'text-success', icon: Check },
  late: { label: 'Filled late', tone: 'text-warning', icon: Clock },
  missed: { label: 'Not filled', tone: 'text-danger', icon: X },
  open: { label: 'In progress', tone: 'text-primary-500', icon: null },
  holiday: { label: 'Holiday', tone: 'text-text-light', icon: CalendarOff },
  off: { label: 'No run', tone: 'text-text-light', icon: null },
  upcoming: { label: 'Not due yet', tone: 'text-text-light', icon: null },
  summary: { label: 'Month total', tone: 'text-text', icon: null },
};

const Ring = ({ percent, tone, dashed, size = 28, children }: { percent: number; tone: string; dashed?: boolean; size?: number; children?: React.ReactNode }) => {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <span className={cn('relative inline-flex items-center justify-center shrink-0', tone)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-border" strokeDasharray={dashed ? '3 4' : undefined} />
        {!dashed && percent > 0 && (
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" strokeLinecap="round" stroke="currentColor" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(percent, 100) / 100)} />
        )}
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
};

// size-11 on touch for a real tap target, back to the compact size-10 on desktop.
const CELL_BOX = 'inline-flex items-center justify-center size-11 sm:size-10';

const Cell = memo(({ cell, name }: { cell: WeeklyCell; name: string }) => {
  const s = STATE[cell.state];
  const percent = cell.total ? Math.round((cell.done / cell.total) * 100) : 0;
  const stateLabel = cell.state === 'open' && cell.done === 0 ? 'Not started' : s.label;
  const label = `${name}, ${shortDate(cell.date)}: ${stateLabel}${cell.total ? `, ${cell.done} of ${cell.total} done` : ''}${cell.compliance !== null ? `, answers right ${formatPct(cell.compliance)}` : ''}`;
  const Icon = s.icon;

  // A month column adds its runs up: the share filled (on time or late), with the split in the tooltip.
  if (cell.state === 'summary') {
    const due = cell.due ?? 0;
    const detail = due === 0 && !cell.open
      ? 'Nothing was due'
      : `${due} due: ${cell.onTime ?? 0} on time, ${cell.late ?? 0} late, ${cell.missed ?? 0} not filled${cell.open ? `, ${cell.open} still open (not counted yet)` : ''}${cell.compliance !== null ? `, answers right ${formatPct(cell.compliance)}` : ''}`;
    const monthName = new Date(`${cell.date}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    // A tap opens the split (hover only on a mouse), so a phone can read it too.
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={`${name}, ${monthName}: ${detail}`}
            aria-label={`${name}, ${monthName}: ${detail}`}
            className={cn(CELL_BOX, 'w-14 sm:w-14 rounded-lg cursor-pointer hover:bg-surface-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}
          >
            {cell.completion == null
              ? <Minus size={14} className="text-text-light" aria-hidden />
              : <span className={cn('text-sm font-display font-bold tabular-nums', rateToneClass(cell.completion))}>{formatPct(cell.completion)}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3">
          <p className="text-sm font-display font-bold text-text">{name}</p>
          <p className="text-xs font-display font-medium text-text-muted">{monthName}</p>
          <p className="mt-2 text-xs font-display text-text-secondary">{detail}</p>
        </PopoverContent>
      </Popover>
    );
  }

  if (!cell.runId) {
    return (
      <span role="img" className={cn(CELL_BOX, 'text-text-light')} title={`${shortDate(cell.date)}: ${s.label}`} aria-label={label}>
        {cell.state === 'holiday' ? <Ring percent={0} tone={s.tone} dashed><CalendarOff size={12} /></Ring> : <Minus size={14} aria-hidden />}
      </span>
    );
  }
  const full = cell.state === 'done' || cell.state === 'late';
  return (
    <Link
      to={`/checklists/${cell.runId}`}
      title={label}
      aria-label={label}
      className={cn(CELL_BOX, 'rounded-lg hover:bg-surface-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}
    >
      <Ring percent={full ? 100 : percent} tone={s.tone}>{Icon && <Icon size={12} strokeWidth={3} />}</Ring>
    </Link>
  );
});
Cell.displayName = 'Cell';

const MatrixRow = memo(({ row }: { row: WeeklyReportRow }) => (
  <tr className="border-b border-border/60 last:border-0">
    <th scope="row" className="sticky left-0 z-10 bg-surface px-3 sm:px-4 py-1.5 font-normal">
      <span className="block text-sm font-display font-semibold text-text leading-snug line-clamp-2">{row.name}</span>
      <span className="block text-xs text-text-muted">{row.storeName}</span>
    </th>
    {row.cells.map(cell => (
      <td key={cell.date} className="px-1 py-1 text-center"><Cell cell={cell} name={row.name} /></td>
    ))}
    <td className="px-2 py-1 text-center">
      {row.completion === null ? (
        <span className="text-text-light">-</span>
      ) : (
        <span className={cn('text-sm font-display font-bold tabular-nums', rateToneClass(row.completion))}>{formatPct(row.completion)}</span>
      )}
      {!!row.open && <span className="block text-xs font-display text-primary-600 dark:text-primary-300">{row.open} open</span>}
    </td>
    <td className="px-2 py-1 text-center">
      {row.rate === null ? (
        <span className="text-text-light">-</span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Ring percent={row.rate} tone={rateToneClass(row.rate)} size={30} />
          <span className={cn('text-sm font-display font-bold tabular-nums', rateToneClass(row.rate))}>{formatPct(row.rate)}</span>
        </span>
      )}
    </td>
    <td className="px-2 py-1 text-center">
      {row.compliance === null ? (
        <span className="text-text-light" title="No answers were checked in this period">-</span>
      ) : (
        <span className={cn('text-sm font-display font-bold tabular-nums', rateToneClass(row.compliance))}>{formatPct(row.compliance)}</span>
      )}
    </td>
  </tr>
));
MatrixRow.displayName = 'MatrixRow';

const STRIP = cn(PANEL_CLASS, 'grid grid-cols-2 sm:grid-cols-4 gap-px bg-border overflow-hidden');

// Same strip and matrix shapes as the real thing, so the page does not jump when the report lands.
const ReportSkeleton = () => (
  <>
    <div className={STRIP}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 p-3.5 bg-surface">
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
  // Kept fresh: a tab left open past midnight rolls over instead of highlighting yesterday.
  const today = useOrgToday();
  // A link from a score can open this on one department and period (?departmentId=&period=&offset=).
  // Read once; after that the pickers on the page own the state.
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
  // Admin and PC pick any department; a department head is always held to their own on the server.
  const canPickDepartment = user?.role === 'ADMIN' || user?.role === 'PC';
  const { data: stores = [], isPending: storesPending } = useStoresQuery();
  const { data: departments = [], isPending: departmentsPending } = useDepartmentsQuery(canPickDepartment);
  const range = windowFor(period, offset, today);
  // The Stores tab compares every store, and its Store control is hidden, so a store picked earlier must not
  // narrow it. Every other filter that applies is shown on the page: the Checklists tab has both pickers, the
  // Departments tab has Store (the department is the row), and a department head's own department is stated below.
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
  // A name or figure on a scoreboard opens that group's own checklists in the matrix.
  const openStore = (id: string) => { setStoreId(id); setView('checklists'); };
  const openDepartment = (id: string) => { if (canPickDepartment) setDepartmentId(id); setView('checklists'); };

  const storeOptions = useMemo(() => stores.map(s => ({ value: s.id, label: s.name })), [stores]);
  const departmentOptions = useMemo(() => departments.map(d => ({ value: d.id, label: d.name })), [departments]);

  const rows = data?.rows;
  const holidayDays = useMemo(() => (data ? Object.keys(data.holidays).sort() : []), [data]);
  const summary = data?.summary;
  const summaryTiles = useMemo(() => summary && [
    { label: 'Filled', hint: 'Runs filled, on time or late, out of the runs that were due', value: formatPct(summary.completion), tone: summary.completion === null ? '' : rateToneClass(summary.completion) },
    { label: 'Met deadline', hint: 'Runs filled on time, out of the runs that were due', value: formatPct(summary.metDeadlinePct), tone: summary.metDeadlinePct === null ? '' : rateToneClass(summary.metDeadlinePct) },
    { label: 'On time (of finished)', hint: 'Runs filled on time, out of the runs that were filled', value: formatPct(summary.onTimeOfFinishedPct), tone: summary.onTimeOfFinishedPct === null ? '' : rateToneClass(summary.onTimeOfFinishedPct) },
    { label: 'Answers right', hint: 'How well the checked answers were answered (compliance)', value: formatPct(summary.compliance), tone: summary.compliance === null ? '' : rateToneClass(summary.compliance) },
    { label: 'Filled on time', value: summary.onTime, tone: 'text-success' },
    { label: 'Filled late', value: summary.late, tone: summary.late ? 'text-warning' : '' },
    { label: 'Not filled', value: summary.missed, tone: summary.missed ? 'text-danger' : '' },
    ...(summary.open ? [{ label: 'Still open', hint: 'Not filled yet and not past the cutoff: in no percentage', value: summary.open, tone: 'text-primary-600 dark:text-primary-300' }] : []),
  ], [summary]);

  const periodWord = PERIOD_LABEL[period].toLowerCase();
  // The empty window gets the one recovery that fits: drop the filters, else jump back to now.
  const emptyAction = storeId || departmentId
    ? { label: 'Clear filters', onClick: () => { setStoreId(''); setDepartmentId(''); } }
    : offset !== 0
      ? { label: `Go to this ${periodWord}`, onClick: () => setOffset(0) }
      : undefined;
  const isMonthView = data?.kind === 'month';

  // The Departments and Stores scoreboards as on screen: best first, level groups sharing a rank.
  const boardItems = view === 'departments' ? departmentItems : storeItems;
  const exportBoard = (): TableRows => {
    const { ranked, winner, rankOf } = rankScoreboard(boardItems);
    const winners = new Set(winner.map((w) => w.id));
    return [
      ['Rank', view === 'departments' ? 'Department' : 'Store', 'Checklist score %', 'Completion %', 'Answers right %', 'Due', 'Filled', 'Not filled', 'Still open', 'Too few runs to rank', 'Winner'],
      ...ranked.map((i, idx) => [rankOf(i, idx), i.name, exportPct(i.score), exportPct(i.completion), exportPct(i.compliance), i.due, i.completed, i.missed, i.open, i.rankable ? '' : 'Yes', winners.has(i.id) ? 'Yes' : '']),
    ];
  };
  const storeName = stores.find((s) => s.id === storeId)?.name;
  const departmentName = canPickDepartment ? departments.find((d) => d.id === departmentId)?.name : undefined;

  return (
    <div className="flex flex-col gap-4 w-full">
      <PageHeader icon={CalendarCheck2} title="Report" subtitle="Checklist scores by checklist, department and store, with the winner for each week, month or year. Tickets and delegations are in the Scorecard." />

      <div role="tablist" aria-label="Report view" className="inline-flex w-full sm:w-fit gap-1 rounded-xl border border-border bg-surface-hover/40 p-1">
        {VIEWS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={cn(
              'inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 min-h-11 sm:min-h-9 rounded-lg px-3.5 text-sm font-display font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/40',
              view === key ? 'bg-primary-600 text-white dark:bg-primary-500' : 'text-text-secondary hover:text-text',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2 w-full sm:w-auto">
          <PeriodTabControl value={period} options={PERIODS} labels={PERIOD_LABEL} onChange={(next) => { setPeriod(next); setOffset(0); }} fill />
          <div className="flex items-center justify-between sm:justify-start gap-1">
            <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${periodWord}`} className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-hover hover:text-text">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="min-w-36 text-center text-xs font-display font-bold text-text">{range.label}</span>
            <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label={`Next ${periodWord}`} className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-hover hover:text-text disabled:opacity-40 disabled:hover:border-border">
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
            {offset !== 0 && (
              <button type="button" onClick={() => setOffset(0)} className="ml-1 min-h-9 pointer-coarse:min-h-11 rounded-lg px-2 text-xs font-display font-bold text-primary-700 hover:underline dark:text-primary-300">
                This {periodWord}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
          {view !== 'stores' && (
          <div className="flex flex-col gap-1.5 flex-1 min-w-40 sm:flex-none sm:w-52">
            <label htmlFor="weekly-store" className="text-xs font-display font-medium text-text-secondary">Store</label>
            <Combobox
              id="weekly-store"
              value={storeId}
              onChange={setStoreId}
              options={storeOptions}
              emptyOptionLabel="All stores"
              isLoading={storesPending}
              className="h-11 rounded-xl"
            />
          </div>
          )}
          {canPickDepartment && view !== 'departments' && (
            <div className="flex flex-col gap-1.5 flex-1 min-w-40 sm:flex-none sm:w-52">
              <label htmlFor="weekly-department" className="text-xs font-display font-medium text-text-secondary">Department</label>
              <Combobox
                id="weekly-department"
                value={departmentId}
                onChange={setDepartmentId}
                options={departmentOptions}
                emptyOptionLabel="All departments"
                isLoading={departmentsPending}
                className="h-11 rounded-xl"
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
              className="h-11 pointer-coarse:h-11 rounded-xl"
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

      {/* keepPreviousData holds the old window on screen while the next loads. The numbers are never dimmed: a plain
          "Updating" line says they are still the previous window's, until the real ones land. */}
      {view === 'checklists' && data && !!rows?.length && (
        <div className="flex flex-col gap-3" aria-busy={isPlaceholderData}>
          {isPlaceholderData && (
            <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These figures are for the previous period until {range.label} loads.</p>
          )}
          {summary && summary.due + (summary.open ?? 0) > 0 && (
            <dl className={STRIP}>
              {summaryTiles?.map(t => (
                <div key={t.label} className="flex flex-col gap-0.5 px-3.5 py-3 bg-surface">
                  <dt className="text-xs font-display text-text-muted" title={t.hint}>{t.label}</dt>
                  <dd className={cn('text-lg sm:text-xl font-display font-bold tabular-nums text-text leading-tight', t.tone)}>{t.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {summary && summary.due + (summary.open ?? 0) === 0 && (
            <p className="text-xs font-display text-text-muted">
              Nothing was due in this {periodWord} yet.
            </p>
          )}
          {!!summary?.open && (
            <p role="status" className="text-xs font-display font-medium text-primary-700 dark:text-primary-300">
              {summary.open} checklist{summary.open === 1 ? ' is' : 's are'} still open and not in these percentages yet. An open checklist counts once its cutoff passes or it is filled.
            </p>
          )}
          {summary && summary.due + (summary.open ?? 0) > 0 && (
            <details className="group text-xs font-display text-text-muted">
              <summary className="inline-flex items-center gap-1 min-h-9 pointer-coarse:min-h-11 cursor-pointer select-none font-semibold text-text-secondary hover:text-text list-none [&::-webkit-details-marker]:hidden">
                How these figures are counted
                <ChevronRight className="size-3.5 transition-transform duration-200 group-open:rotate-90" aria-hidden />
              </summary>
              <p className="pb-1 leading-relaxed">
                Filled is the share of due checklists that got filled, on time or late. It counts whole checklists, not questions (Store daily and Department monthly count questions). Met deadline is the share of due checklists filled before their cutoff, so late and not-filled ones both count against it. On time (of finished) is the share of filled checklists that were filled before their cutoff. Answers right is how well the checked answers were answered (compliance), with critical questions counted twice and sent-back ones counted as failed.
              </p>
            </details>
          )}

          {/* A scroll area has to be reachable and named for keyboard and screen-reader users. */}
          <div role="region" aria-label="Fill matrix, scrolls sideways" tabIndex={0} className={cn(PANEL_CLASS, 'overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}>
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Daily checklist fill status, {range.label}</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="sticky left-0 z-10 bg-surface px-3 sm:px-4 py-2.5 text-xs font-display font-semibold text-text-secondary min-w-36 sm:min-w-48">Checklist</th>
                  {data.columns.map((col) => (
                    <th key={col.key} scope="col" className={cn('px-1 py-2 text-center', isMonthView ? 'min-w-14' : data.columns.length > 7 ? 'min-w-10' : 'min-w-12')} title={data.holidays[col.key]}>
                      {isMonthView ? (
                        <span className="text-xs font-display font-medium text-text-muted">{col.label}</span>
                      ) : (
                        <span className={cn('flex flex-col items-center text-xs font-display leading-tight', col.key === today ? 'text-primary-600 dark:text-primary-300 font-bold' : 'text-text-muted font-medium')}>
                          {WEEKDAYS[new Date(`${col.key}T00:00:00Z`).getUTCDay()]}
                          <span className="tabular-nums text-sm">{col.key.slice(8)}</span>
                          {data.holidays[col.key] && data.columns.length <= 7 && <span className="text-xs text-text-light">Holiday</span>}
                        </span>
                      )}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2.5 text-center text-xs font-display font-semibold text-text-secondary min-w-16" title="Share of due runs that got filled, on time or late. Open runs are not counted yet.">Filled</th>
                  <th scope="col" className="px-2 py-2.5 text-center text-xs font-display font-semibold text-text-secondary min-w-16" title="Met deadline: share of due runs filled on time">Met deadline</th>
                  <th scope="col" className="px-2 py-2.5 text-center text-xs font-display font-semibold text-text-secondary min-w-16" title="How well the checked answers were answered (compliance)">Answers right</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => <MatrixRow key={`${row.definitionId}-${row.storeId}-${row.scopeKey}`} row={row} />)}
              </tbody>
            </table>
          </div>

          {holidayDays.length > 0 && (
            <p className="text-xs font-display text-text-muted">
              Holiday: {holidayDays.map(d => `${shortDate(d)}, ${data.holidays[d]}`).join('; ')}
            </p>
          )}

          {isMonthView ? (
            <p className="text-xs font-display text-text-muted">Each month shows the share of its due runs that got filled. Hover a month for the split.</p>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-muted font-display" aria-label="Legend">
              {(['done', 'late', 'missed', 'open', 'holiday'] as WeeklyCellState[]).map(k => {
                const s = STATE[k];
                const Icon = s.icon;
                return (
                  <li key={k} className="inline-flex items-center gap-1.5">
                    <Ring percent={k === 'open' ? 50 : k === 'missed' ? 40 : 100} tone={s.tone} dashed={k === 'holiday'} size={18}>
                      {Icon && <Icon size={8} strokeWidth={3.5} />}
                    </Ring>
                    {s.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
