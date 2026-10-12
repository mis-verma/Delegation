import { memo, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, SearchX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton, type ExportSource } from '../../../components';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui/dialog';
import { useAuth } from '../../../context/AuthContext';
import type { ScoreReportRow, Scores } from '../../../api/scores';
import { exportTitle, type TableRows } from '../../../lib/exportTable';
import { MODULE_EXPORT_HEAD, moduleCounts, moduleExportCells, overallOf } from '../../dashboard/scoreMetrics';
import { scoreQuery, useScoreReport, useStoreScoreReport } from '../../dashboard/scoreQueries';
import { checklistDrillHref, delegationDrillHref, ticketDrillHref, type DrillKind, type DrillSubject } from '../../dashboard/scoreDrill';
import { rateToneClass } from '../../checklist/checklistDisplay';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { PERIOD_LABEL, windowFor, type ScorePeriod } from '../../dashboard/scorePeriods';

type ViewBy = 'department' | 'store' | 'person';
type Module = 'checklist' | 'ticket' | 'delegation';
type Measure = 'completion' | 'compliance' | 'ontime';
type MeasureView = 'all' | Measure;
type SortKey = 'name' | 'overall' | `${Module}.${Measure}`;

const MODULES: { key: Module; label: string }[] = [
  { key: 'checklist', label: 'Checklist' },
  { key: 'ticket', label: 'Tickets' },
  { key: 'delegation', label: 'Delegations' },
];
const MEASURES: { key: Measure; label: string; short: string }[] = [
  { key: 'completion', label: 'Completion', short: 'Completion' },
  { key: 'compliance', label: 'Compliance', short: 'Compliance' },
  { key: 'ontime', label: 'On time', short: 'On time' },
];
const VIEW_LABEL: Record<ViewBy, string> = { department: 'Departments', store: 'Stores', person: 'People' };
const NAME_HEAD: Record<ViewBy, string> = { department: 'Department', store: 'Store', person: 'Person' };
const MEASURE_VIEW_LABEL: Record<MeasureView, string> = { all: 'All', completion: 'Completion', compliance: 'Compliance', ontime: 'On time' };
const PERIOD_OPTIONS: readonly ScorePeriod[] = ['week', 'month', 'quarter', 'year'];
const DAY_PARAM = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type ModuleScore = ScoreReportRow['checklist'] | ScoreReportRow['ticket'] | ScoreReportRow['delegation'];

const valueOf = (m: ModuleScore, measure: Measure): number | null =>
  measure === 'completion' ? m.completionPct : measure === 'compliance' ? m.compliancePct : m.onTimePct;

/** What was done, late or not done, per module: the shared rule (late = finished after the deadline). */
const delayOf = (row: Pick<ScoreReportRow, Module>, key: Module) => {
  const { done, late, notDone } = moduleCounts(row, key);
  return { done, late, missed: notDone };
};

// '2026-10-01' -> '1 Oct 2026', for a window that came in on the address instead of a period tab.
const dayLabel = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''} ${y}`;
};

const Pct = ({ value, strong }: { value: number | null; strong?: boolean }) => (
  <span className={cn('tabular-nums', strong ? 'font-bold' : 'font-semibold', value === null ? 'text-text-light' : rateToneClass(value))}>
    {value === null ? '-' : `${value}%`}
  </span>
);

// Done, late and not done in words, separated by commas. Late and not done are coloured only when there are any.
const CountsLine = ({ due, done, late, missed }: { due?: number; done: number; late: number; missed: number }) => (
  <p className="t-meta text-text-muted tabular-nums">
    {due !== undefined && <>{due} due, </>}
    {done} done, <span className={late ? 'text-warning font-semibold' : ''}>{late} late</span>, <span className={missed ? 'text-danger font-semibold' : ''}>{missed} not done</span>
  </p>
);

// ---------------------------------------------------------------------------------------------
// The organisation in three cards
// ---------------------------------------------------------------------------------------------

const ModuleSummary = ({ label, module, scores }: { label: string; module: Module; scores: Scores }) => {
  const data = scores[module];
  const { done, late, missed } = delayOf(scores, module);
  return (
    <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4')}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="t-card font-display font-bold text-text">{label}</h3>
        <span className="t-meta text-text-muted tabular-nums">{data.due} due</span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {MEASURES.map((m) => (
          <div key={m.key} className="flex flex-col gap-0.5 rounded-lg border border-border/60 px-2 py-2 text-center">
            <dt className="t-meta text-text-muted">{m.label}</dt>
            <dd className="t-figure font-display"><Pct value={valueOf(data, m.key)} strong /></dd>
          </div>
        ))}
      </dl>
      <CountsLine done={done} late={late} missed={missed} />
    </div>
  );
};

const OrgSummary = ({ from, to }: { from: string; to: string }) => {
  const query = useQuery<Scores>({ ...scoreQuery('org', undefined, from, to), placeholderData: keepPreviousData });
  if (query.isError && !query.data) return <InlineError message="Could not load the organisation totals." onRetry={() => void query.refetch()} />;
  if (!query.data) {
    return <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{MODULES.map((m) => <Skeleton key={m.key} className="h-40 rounded-2xl" />)}</div>;
  }
  // No dim while the next period loads: the old numbers stay as they are until the new ones land.
  return (
    <section aria-label="Whole organisation" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {MODULES.map((m) => <ModuleSummary key={m.key} label={m.label} module={m.key} scores={query.data} />)}
    </section>
  );
};

// ---------------------------------------------------------------------------------------------
// One row's detail
// ---------------------------------------------------------------------------------------------

const DRILL_LINK_CLASS =
  'inline-flex min-h-9 pointer-coarse:min-h-11 items-center gap-0.5 rounded-lg border border-border px-2.5 t-meta font-display font-semibold text-text-secondary transition-[border-color,color,transform] duration-150 ease-out hover:border-border-hover hover:text-text active:scale-[0.985] outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';

interface DrillLink { label: string; href: string }

// The exact items behind a module's figures: the subject (person, department or store) and the period
// travel with the link, and each link opens only what its count says.
const drillLinksFor = (
  orgWide: boolean,
  subject: DrillSubject,
  window: { from: string; to: string; period?: { period: ScorePeriod; offset: number } },
  row: Pick<ScoreReportRow, Module>,
  key: Module,
): DrillLink[] => {
  const { late, missed } = delayOf(row, key);
  const href = (kind: DrillKind) =>
    key === 'ticket' ? ticketDrillHref(orgWide, subject, window.from, window.to, kind)
      : key === 'delegation' ? delegationDrillHref(subject, window.from, window.to, kind)
        : checklistDrillHref(orgWide, subject, window.from, window.to, kind, window.period);
  // A department's checklists open its fill report, which has no late or missed split of its own.
  if (key === 'checklist' && subject.kind === 'department') return [{ label: 'Open fill report', href: href('notDone') }];
  const links: DrillLink[] = [];
  // The run history has no "finished late" filter, so a checklist's late link opens its finished runs and says so.
  if (late > 0) links.push({ label: key === 'checklist' ? `Finished runs (${late} late)` : `Late (${late})`, href: href('late') });
  if (missed > 0) links.push({ label: `Not done (${missed})`, href: href('notDone') });
  return links;
};

interface RowDetailProps {
  row: ScoreReportRow | null;
  viewBy: ViewBy;
  windowLabel: string;
  window: { from: string; to: string; period?: { period: ScorePeriod; offset: number } };
  orgWide: boolean;
  onClose: () => void;
}

const RowDetail = ({ row, viewBy, windowLabel, window, orgWide, onClose }: RowDetailProps) => (
  <Dialog open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-lg gap-4 p-5 sm:p-6">
      {row && (
        <>
          <div className="flex flex-col gap-0.5 pr-10">
            <DialogTitle className="t-section font-display font-bold text-text">{row.name}</DialogTitle>
            <DialogDescription className="t-meta text-text-muted">
              {[viewBy === 'person' ? row.department : null, windowLabel].filter(Boolean).join(', ')}
            </DialogDescription>
          </div>
          <div className="flex flex-col gap-2">
            {MODULES.map(({ key, label }) => {
              const m = row[key];
              const { done, late, missed } = delayOf(row, key);
              const links = m.due > 0 ? drillLinksFor(orgWide, { kind: viewBy, id: row.id }, window, row, key) : [];
              return (
                <div key={key} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                  <span className="t-card font-display font-semibold text-text">{label}</span>
                  {m.due === 0 ? (
                    <p className="t-meta text-text-muted">Nothing due in this period</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {MEASURES.map((ms) => (
                          <div key={ms.key} className="flex flex-col">
                            <span className="t-meta text-text-muted">{ms.label}</span>
                            <span className="t-figure font-display"><Pct value={valueOf(m, ms.key)} strong /></span>
                          </div>
                        ))}
                      </div>
                      <CountsLine due={m.due} done={done} late={late} missed={missed} />
                      {links.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          {links.map((l) => (
                            <Link key={l.label} viewTransition to={l.href} className={DRILL_LINK_CLASS}>
                              {l.label} <ChevronRight className="size-3.5" aria-hidden="true" />
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </DialogContent>
  </Dialog>
);

// ---------------------------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------------------------

const SortHead = ({ label, sortKey, active, ascending, onSort, className }: { label: string; sortKey: SortKey; active: SortKey; ascending: boolean; onSort: (k: SortKey) => void; className?: string }) => (
  <th scope="col" aria-sort={active === sortKey ? (ascending ? 'ascending' : 'descending') : 'none'} className={cn('px-2 py-2 text-center', className)}>
    <button type="button" onClick={() => onSort(sortKey)} className="inline-flex min-h-8 items-center gap-0.5 t-meta font-display font-semibold text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40">
      {label}
      {active === sortKey && (ascending ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
    </button>
  </th>
);

const MobileRow = memo(({ row, rank, measures, onOpen }: { row: ScoreReportRow & { overall: number | null }; rank: number; measures: Measure[]; onOpen: () => void }) => (
  <li>
    <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left outline-none transition-[border-color,transform] duration-150 hover:border-border-hover active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40">
      <span className="flex items-center gap-2">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-hover t-meta font-display font-bold tabular-nums text-text-secondary">{rank}</span>
        <span className="min-w-0 flex-1">
          <span className="block t-card font-display font-semibold leading-snug text-text line-clamp-2">{row.name}</span>
          {row.department && <span className="block truncate t-meta text-text-muted">{row.department}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end leading-tight">
          <span className="t-figure font-display"><Pct value={row.overall} strong /></span>
          <span className="t-meta text-text-muted">overall</span>
        </span>
      </span>
      <span className="grid gap-x-2 gap-y-1 border-t border-border/60 pt-2 t-meta" style={{ gridTemplateColumns: `minmax(0,1.4fr) repeat(${measures.length}, minmax(0,1fr))` }}>
        <span aria-hidden="true" />
        {measures.map((ms) => <span key={ms} className="text-center font-semibold text-text-muted">{MEASURES.find((x) => x.key === ms)!.short}</span>)}
        {MODULES.map(({ key, label }) => (
          <span key={key} className="contents">
            <span className="truncate text-text-secondary">{label}</span>
            {measures.map((ms) => (
              <span key={ms} className="text-center">{row[key].due === 0 ? <span className="text-text-light">-</span> : <Pct value={valueOf(row[key], ms)} />}</span>
            ))}
          </span>
        ))}
      </span>
    </button>
  </li>
));
MobileRow.displayName = 'ScorecardMobileRow';

/**
 * Checklists, tickets and delegations side by side for every department, store or person, on the three
 * measures that matter: completion (done out of what was due), compliance (handed in right, or in time)
 * and on time. Admin and PC also see the whole organisation on top; a department head sees their own
 * department and its people. Worst first, so who needs a conversation is on top; sort any column,
 * search, open a row for its counts and the exact late and unfinished items, export.
 *
 * The address can open it on one row and window: ?view=person&open=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD
 * (the Overview's leaders, leaderboard and rankings link here that way).
 */
export const ScorecardPage = () => {
  const { user } = useAuth();
  const orgWide = user?.role === 'ADMIN' || user?.role === 'PC';
  const views: ViewBy[] = orgWide ? ['department', 'store', 'person'] : ['department', 'person'];
  const [searchParams, setSearchParams] = useSearchParams();

  const [period, setPeriod] = useState<ScorePeriod>('month');
  const [offset, setOffset] = useState(0);
  // A window that came in on the address (from the Overview), kept until a period is picked.
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    return from && to && DAY_PARAM.test(from) && DAY_PARAM.test(to) && from <= to ? { from, to } : null;
  });
  const [viewBy, setViewBy] = useState<ViewBy>(() => {
    const requested = searchParams.get('view');
    return views.find((v) => v === requested) ?? 'department';
  });
  const [measureView, setMeasureView] = useState<MeasureView>('all');
  const [query, setQuery] = useState('');
  // Worst first by default: the rows that need attention lead, rows with nothing due sink to the bottom.
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [ascending, setAscending] = useState(true);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get('open'));

  const periodRange = windowFor(period, offset);
  const range = custom
    ? { from: custom.from, to: custom.to, label: custom.from === custom.to ? dayLabel(custom.from) : `${dayLabel(custom.from)} to ${dayLabel(custom.to)}` }
    : periodRange;
  // Departments and people in one request, stores in their own: switching to Stores never refetches the
  // people, and switching back is instant. The same cache the Overview cards read.
  const peopleReport = useScoreReport(range.from, range.to);
  const storeReport = useStoreScoreReport(range.from, range.to, orgWide && viewBy === 'store');
  const active = viewBy === 'store' ? storeReport : peopleReport;

  const measures: Measure[] = measureView === 'all' ? ['completion', 'compliance', 'ontime'] : [measureView];

  const source = viewBy === 'person' ? peopleReport.data?.people : viewBy === 'department' ? peopleReport.data?.departments : storeReport.data;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (source ?? [])
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.department.toLowerCase().includes(needle))
      .map((r) => ({ ...r, overall: overallOf(r) }));
    const value = (r: (typeof list)[number]): number | string | null => {
      if (sortKey === 'name') return r.name.toLowerCase();
      if (sortKey === 'overall') return r.overall;
      const [mod, ms] = sortKey.split('.') as [Module, Measure];
      return r[mod].due > 0 ? valueOf(r[mod], ms) : null;
    };
    return list.sort((a, b) => {
      const x = value(a), y = value(b);
      // Rows with no figure sink to the bottom whichever way the list is sorted.
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      const diff = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
      return (ascending ? diff : -diff) || a.name.localeCompare(b.name);
    });
  }, [source, query, sortKey, ascending]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAscending((v) => !v);
    // Names read A to Z; a figure starts worst first.
    else { setSortKey(key); setAscending(true); }
  };

  const pickPeriod = (next: ScorePeriod) => { setPeriod(next); setOffset(0); setCustom(null); };
  const closeRow = () => {
    setOpenId(null);
    if (searchParams.has('open')) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      }, { replace: true });
    }
  };

  // The table as sorted and searched on screen, every measure, with the counts behind them.
  const exportRows = (): TableRows => {
    const head: string[] = [NAME_HEAD[viewBy], ...(viewBy === 'person' ? ['Department'] : []), 'Overall score'];
    for (const m of MODULES) head.push(`${m.label} due`, `${m.label} done`, `${m.label} completion %`, `${m.label} compliance %`, `${m.label} on time %`, `${m.label} late`, `${m.label} not done`);
    const body = rows.map((r) => {
      const cells: (string | number | null)[] = [r.name, ...(viewBy === 'person' ? [r.department] : []), r.overall];
      for (const m of MODULES) {
        const s = r[m.key];
        const d = delayOf(r, m.key);
        cells.push(s.due, d.done, s.completionPct, s.compliancePct, s.onTimePct, d.late, d.missed);
      }
      return cells;
    });
    return [head, ...body];
  };
  const queryClient = useQueryClient();
  // Admin and PC also see the whole organisation in three cards above the table.
  const orgExport: ExportSource[] = orgWide
    ? [{
        label: 'Whole organisation',
        filename: 'scorecard-organisation',
        title: exportTitle({ what: 'Scorecard, whole organisation', from: range.from, to: range.to, period: range.label }),
        getRows: async () => {
          const org = await queryClient.fetchQuery<Scores>(scoreQuery('org', undefined, range.from, range.to));
          return [['Module', ...MODULE_EXPORT_HEAD], ...MODULES.map((m) => [m.label, ...moduleExportCells(org, m.key)])];
        },
      }]
    : [];

  const openRow = rows.find((r) => r.id === openId) ?? null;
  const periodWord = custom ? 'period' : PERIOD_LABEL[period].toLowerCase();
  const drillWindow = { from: range.from, to: range.to, period: custom ? undefined : { period, offset } };

  return (
    <div className="flex flex-col gap-4 w-full">
      <h1 className="sr-only">Scorecard</h1>

      {/* Period, then the view and the measure. */}
      <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3')}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <PeriodTabControl value={period} options={PERIOD_OPTIONS} labels={PERIOD_LABEL} onChange={pickPeriod} fill dense />
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-hover/30 p-1 lg:w-80">
            {custom ? (
              <>
                <span className="min-w-0 flex-1 truncate px-2 text-center text-sm font-display font-semibold text-text">{range.label}</span>
                <button type="button" onClick={() => setCustom(null)} aria-label="Clear these dates and go back to the period tabs" className="inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${periodWord}`} className="inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text">
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <span className="min-w-0 flex-1 truncate text-center text-sm font-display font-semibold text-text">{range.label}</span>
                <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label={`Next ${periodWord}`} className="inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-40 disabled:hover:bg-transparent">
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {orgWide && <OrgSummary from={range.from} to={range.to} />}

      <section aria-label={`By ${VIEW_LABEL[viewBy].toLowerCase()}`} className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3 sm:p-4')}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <PeriodTabControl value={viewBy} options={views} labels={VIEW_LABEL} onChange={(v) => { setViewBy(v); setQuery(''); }} fill dense className="lg:w-80" />
          <PeriodTabControl value={measureView} options={['all', 'completion', 'compliance', 'ontime'] as const} labels={MEASURE_VIEW_LABEL} onChange={setMeasureView} fill dense className="lg:w-96" />
          <div className="flex items-center gap-2 lg:ml-auto">
            <label className="relative block flex-1 lg:w-56 lg:flex-none">
              <span className="sr-only">Search {VIEW_LABEL[viewBy].toLowerCase()}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-light" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${VIEW_LABEL[viewBy].toLowerCase()}`}
                className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-base text-text outline-none transition-colors placeholder:text-text-light focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:text-sm"
              />
            </label>
            <ExportMenu
              disabled={!rows.length}
              aria-label={`Export the scorecard by ${VIEW_LABEL[viewBy].toLowerCase()}`}
              label={`By ${VIEW_LABEL[viewBy].toLowerCase()}`}
              filename={`scorecard-${viewBy}`}
              title={exportTitle({ what: `Scorecard, ${VIEW_LABEL[viewBy]}`, from: range.from, to: range.to, period: range.label, filters: { Search: query.trim() } })}
              getRows={exportRows}
              more={orgExport}
            />
          </div>
        </div>

        {active.isError && !active.data ? (
          <InlineError message="Could not load the scorecard." onRetry={() => void active.refetch()} />
        ) : !active.data ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading the scorecard">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState size="compact" icon={SearchX} title={query.trim() ? 'No matches' : `Nothing was due in this ${periodWord}`} description={query.trim() ? `Nothing matches "${query.trim()}".` : 'Try another period.'} />
        ) : (
          // No dim while the next period loads: the old numbers stay until the new ones land.
          <div>
            {/* Phone: one card per row. */}
            <ol className="flex flex-col gap-2 md:hidden">
              {rows.map((r, i) => <MobileRow key={r.id} row={r} rank={i + 1} measures={measures} onOpen={() => setOpenId(r.id)} />)}
            </ol>

            {/* Tablet and desktop: a sortable table, the modules as column groups. */}
            <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Scorecard by {VIEW_LABEL[viewBy].toLowerCase()}, {range.label}</caption>
                <thead>
                  <tr className="bg-surface-hover/40">
                    <th scope="col" rowSpan={measures.length > 1 ? 2 : 1} className="sticky left-0 z-10 bg-surface-hover px-3 py-2 align-bottom">
                      <button type="button" onClick={() => sortBy('name')} className="inline-flex min-h-8 items-center gap-0.5 t-meta font-display font-semibold text-text-secondary hover:text-text">
                        {NAME_HEAD[viewBy]}
                        {sortKey === 'name' && (ascending ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                      </button>
                    </th>
                    {measures.length > 1 ? (
                      MODULES.map((m) => <th key={m.key} scope="colgroup" colSpan={measures.length} className="border-l border-border/60 px-2 pt-2 text-center t-meta font-display font-bold text-text">{m.label}</th>)
                    ) : (
                      MODULES.map((m) => <SortHead key={m.key} label={m.label} sortKey={`${m.key}.${measures[0]}`} active={sortKey} ascending={ascending} onSort={sortBy} className="border-l border-border/60" />)
                    )}
                    <SortHead label="Overall score" sortKey="overall" active={sortKey} ascending={ascending} onSort={sortBy} className="border-l border-border/60" />
                  </tr>
                  {measures.length > 1 && (
                    <tr className="bg-surface-hover/40">
                      {MODULES.flatMap((m) => measures.map((ms, i) => (
                        <SortHead key={`${m.key}.${ms}`} label={MEASURES.find((x) => x.key === ms)!.short} sortKey={`${m.key}.${ms}`} active={sortKey} ascending={ascending} onSort={sortBy} className={i === 0 ? 'border-l border-border/60' : ''} />
                      )))}
                      <th scope="col" aria-hidden="true" className="border-l border-border/60" />
                    </tr>
                  )}
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer border-t border-border/60 transition-colors hover:bg-surface-hover/40">
                      <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 font-normal">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }} className="flex min-h-9 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
                          <span className="text-sm font-display font-semibold text-text">{r.name}</span>
                          {viewBy === 'person' && r.department && <span className="t-meta text-text-muted">{r.department}</span>}
                        </button>
                      </th>
                      {MODULES.flatMap((m) => measures.map((ms, i) => (
                        <td key={`${m.key}.${ms}`} className={cn('px-2 py-2 text-center text-sm', i === 0 && 'border-l border-border/60')}>
                          {r[m.key].due === 0 ? <span className="text-text-light">-</span> : <Pct value={valueOf(r[m.key], ms)} />}
                        </td>
                      )))}
                      <td className="border-l border-border/60 px-3 py-2 text-center text-base font-display"><Pct value={r.overall} strong /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="t-meta text-text-muted">
          Completion: done out of what was due (a checklist run counts once all its questions are done). Compliance: done right (checklists) or handed in on time, finished or waiting for approval (tickets and delegations). On time: of what was finished, the share finished before its cutoff. Overall score: completion and compliance of every module with work due, counted equally. Worst first; a dash means nothing was due.
        </p>
      </section>

      <RowDetail row={openRow} viewBy={viewBy} windowLabel={range.label} window={drillWindow} orgWide={orgWide} onClose={closeRow} />
    </div>
  );
};
