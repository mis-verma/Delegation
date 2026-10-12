import { memo, useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ChevronRight, Search, SearchX, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton, type ExportSource } from '../../../components';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui/dialog';
import { InfoHint } from '../../../components/infoHint/InfoHint';
import { useAuth } from '../../../context/AuthContext';
import { NO_DEPARTMENT_ROW_ID, UNASSIGNED_ROW_ID, type ScoreReportRow, type Scores } from '../../../api/scores';
import { exportTitle, type TableRows } from '../../../lib/exportTable';
import { MODULE_EXPORT_HEAD, moduleCounts, moduleExportCells, moduleOverall, overallOf } from '../../dashboard/scoreMetrics';
import { scoreQuery, useScoreReport, useStoreScoreReport } from '../../dashboard/scoreQueries';
import { checklistDrillHref, delegationDrillHref, ticketDrillHref, type DrillKind, type DrillSubject } from '../../dashboard/scoreDrill';
import { rateToneClass } from '../../checklist/checklistDisplay';
import { useOrgToday } from '../../checklist/useOrgToday';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { windowFor, type ScorePeriod } from '../../dashboard/scorePeriods';
import { AnalyticsControlBar } from './GroupByControl';
import { defaultWindow, parseDateParam, toDateParam } from './analyticsDisplay';
import { useAnalyticsRefresh } from './useAnalyticsQueries';
import { useAnalyticsWindow, useSearchPatch } from './useAnalyticsWindow';

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
const MEASURE_KEYS: readonly Measure[] = ['completion', 'compliance', 'ontime'];
// One plain name per figure, the same in the cards, the table, the popup and the exports. For tickets and
// delegations "compliance" is the share of everything that came due which was handed in by its deadline
// (so work still waiting for approval counts); "on time" is only of what was finished.
const MEASURE_NAME: Record<Module, Record<Measure, string>> = {
  checklist: { completion: 'Completion', compliance: 'Answers right', ontime: 'On time (of finished)' },
  ticket: { completion: 'Completion', compliance: 'Met deadline', ontime: 'On time (of finished)' },
  delegation: { completion: 'Completion', compliance: 'Met deadline', ontime: 'On time (of finished)' },
};
const VIEW_LABEL: Record<ViewBy, string> = { department: 'Departments', store: 'Stores', person: 'People' };
const NAME_HEAD: Record<ViewBy, string> = { department: 'Department', store: 'Store', person: 'Person' };
const MEASURE_VIEW_LABEL: Record<MeasureView, string> = { all: 'All', completion: 'Completion', compliance: 'Compliance', ontime: 'On time' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATCH_ALL_IDS: readonly string[] = [NO_DEPARTMENT_ROW_ID, UNASSIGNED_ROW_ID];

type ModuleScore = ScoreReportRow['checklist'] | ScoreReportRow['ticket'] | ScoreReportRow['delegation'];

const valueOf = (m: ModuleScore, measure: Measure): number | null =>
  measure === 'completion' ? m.completionPct : measure === 'compliance' ? m.compliancePct : m.onTimePct;

/** What was done, late or not done, per module: the shared rule (late = finished after the deadline). */
const delayOf = (row: Pick<ScoreReportRow, Module>, key: Module) => {
  const { done, late, notDone } = moduleCounts(row, key);
  return { done, late, missed: notDone };
};

// '2026-10-01' -> '1 Oct 2026'.
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
    <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3 sm:p-4')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h3 className="t-card font-display font-bold text-text">{label}</h3>
          <span className="t-meta text-text-muted tabular-nums">{data.due} due</span>
        </div>
        <div className="flex shrink-0 flex-col items-end rounded-lg sm:border sm:border-border/60 sm:px-3 sm:py-1.5">
          <span className="t-figure font-display"><Pct value={moduleOverall(scores, module)} strong /></span>
          <span className="t-meta text-text-muted">Overall score</span>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {MEASURE_KEYS.map((m) => (
          <div key={m} className="flex min-w-0 flex-col gap-0.5 text-center sm:rounded-lg sm:border sm:border-border/60 sm:px-2 sm:py-2">
            <dt className="t-meta text-text-muted">{MEASURE_NAME[module][m]}</dt>
            <dd className="t-card sm:t-figure font-display"><Pct value={valueOf(data, m)} strong /></dd>
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
    return <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{MODULES.map((m) => <Skeleton key={m.key} className="h-32 rounded-2xl sm:h-44" />)}</div>;
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
  /** A department's people: switches the table to People, narrowed to this department. */
  onSeePeople: (row: ScoreReportRow) => void;
}

const RowDetail = ({ row, viewBy, windowLabel, window, orgWide, onClose, onSeePeople }: RowDetailProps) => (
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
              // The catch-all rows have no one person, department or store behind them, so no list to open.
              const links = m.due > 0 && !CATCH_ALL_IDS.includes(row.id) ? drillLinksFor(orgWide, { kind: viewBy, id: row.id }, window, row, key) : [];
              return (
                <div key={key} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="t-card font-display font-semibold text-text">{label}</span>
                    {m.due > 0 && <span className="t-meta text-text-muted">Overall score <Pct value={moduleOverall(row, key)} strong /></span>}
                  </div>
                  {m.due === 0 ? (
                    <p className="t-meta text-text-muted">Nothing due in this period</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {MEASURE_KEYS.map((ms) => (
                          <div key={ms} className="flex min-w-0 flex-col">
                            <span className="t-meta text-text-muted">{MEASURE_NAME[key][ms]}</span>
                            <span className="t-figure font-display"><Pct value={valueOf(m, ms)} strong /></span>
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
          {viewBy === 'department' && (
            <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={() => onSeePeople(row)}>
              <Users size={14} aria-hidden="true" />
              See people in {row.name}
            </Button>
          )}
        </>
      )}
    </DialogContent>
  </Dialog>
);

// ---------------------------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------------------------

const SortHead = ({ label, sortKey, active, ascending, onSort, className }: { label: string; sortKey: SortKey; active: SortKey; ascending: boolean; onSort: (k: SortKey) => void; className?: string }) => (
  <th scope="col" aria-sort={active === sortKey ? (ascending ? 'ascending' : 'descending') : 'none'} className={cn('bg-surface-hover px-2 py-2 text-center', className)}>
    <button type="button" onClick={() => onSort(sortKey)} className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center justify-center gap-0.5 t-meta font-display font-semibold text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40">
      {label}
      {active === sortKey && (ascending ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
    </button>
  </th>
);

// A phone row is a glance: the name, the overall score and each module's own score. Every measure is in
// the popup one tap away, so no row has to fit a grid of labels at 360px.
const MobileRow = memo(({ row, rank, onOpen }: { row: ScoreReportRow & { overall: number | null }; rank: number; onOpen: () => void }) => (
  <li>
    <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left outline-none transition-[border-color,transform] duration-150 hover:border-border-hover active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40">
      <span className="flex items-center gap-2">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-hover t-meta font-display font-bold tabular-nums text-text-secondary">{rank}</span>
        <span className="min-w-0 flex-1">
          <span className="block t-card font-display font-semibold leading-snug text-text line-clamp-2">{row.name}</span>
          {row.department && <span className="block t-meta text-text-muted line-clamp-2">{row.department}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end leading-tight">
          <span className="t-figure font-display"><Pct value={row.overall} strong /></span>
          <span className="t-meta text-text-muted">overall</span>
        </span>
      </span>
      <span className="grid grid-cols-3 gap-2 border-t border-border/60 pt-2">
        {MODULES.map(({ key, label }) => (
          <span key={key} className="flex min-w-0 flex-col">
            <span className="t-meta text-text-muted">{label}</span>
            <span className="t-card font-display">{row[key].due === 0 ? <span className="text-text-light">-</span> : <Pct value={moduleOverall(row, key)} />}</span>
          </span>
        ))}
      </span>
    </button>
  </li>
));
MobileRow.displayName = 'ScorecardMobileRow';

// '2026-10-01' to '2026-10-31' is October when October is a whole calendar period back from today: the fill
// report is told which period that is. Anything else (custom dates, a running period) opens on its default.
const periodOf = (from: string, to: string, today: string): { period: ScorePeriod; offset: number } | undefined => {
  for (const period of ['week', 'month', 'quarter', 'year'] as const) {
    const limit = period === 'week' ? 104 : period === 'month' ? 36 : period === 'quarter' ? 12 : 3;
    for (let offset = 0; offset >= -limit; offset--) {
      const w = windowFor(period, offset, today);
      if (w.from === from && (w.to === to || (offset === 0 && to <= w.to))) return { period, offset };
    }
  }
  return undefined;
};

/**
 * Checklists, tickets and delegations side by side for every department, store or person, on the
 * measures that matter: completion (done out of what was due), compliance (answers right for checklists,
 * the share that met the deadline for tickets and delegations) and on time (of what was finished). Admin
 * and PC also see the whole organisation on top; a department head sees their own department and its
 * people. Worst first, so who needs a conversation is on top; sort any column, search, open a row for its
 * counts and the exact late and unfinished items, export.
 *
 * The period is the same one the Overview keeps in the address (?from=YYYY-MM-DD&to=YYYY-MM-DD, or
 * ?range=all), so it carries over both ways. The address can also open one row: ?view=person&open=<id>.
 */
export const ScorecardPage = () => {
  const { user } = useAuth();
  const orgWide = user?.role === 'ADMIN' || user?.role === 'PC';
  const views: ViewBy[] = orgWide ? ['department', 'store', 'person'] : ['department', 'person'];
  const [searchParams, setSearchParams] = useSearchParams();
  const patch = useSearchPatch();
  const orgToday = useOrgToday();
  const { range: pickedRange, handleRange } = useAnalyticsWindow();
  const { updatedAt, isRefreshing, refresh } = useAnalyticsRefresh();

  const [viewBy, setViewBy] = useState<ViewBy>(() => {
    const requested = searchParams.get('view');
    return views.find((v) => v === requested) ?? 'department';
  });
  const [measureView, setMeasureView] = useState<MeasureView>('all');
  const [query, setQuery] = useState('');
  // A department picked from its popup ("See people"): the People view shows only its people.
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  // Worst first by default: the rows that need attention lead, rows with nothing due sink to the bottom.
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [ascending, setAscending] = useState(true);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get('open'));

  // The window, always as org days: the picked dates, else the last twelve weeks (the long view).
  const range = useMemo(() => {
    let from: string;
    let to: string;
    if (pickedRange.from && pickedRange.to) {
      from = toDateParam(pickedRange.from);
      to = toDateParam(pickedRange.to);
    } else {
      const fallback = defaultWindow('week', parseDateParam(orgToday) ?? undefined);
      from = toDateParam(new Date(fallback.from));
      to = toDateParam(new Date(fallback.to));
    }
    return { from, to, label: from === to ? dayLabel(from) : `${dayLabel(from)} to ${dayLabel(to)}` };
  }, [pickedRange, orgToday]);

  // Departments and people in one request, stores in their own: switching to Stores never refetches the
  // people, and switching back is instant. The same cache the Overview cards read.
  const peopleReport = useScoreReport(range.from, range.to);
  const storeReport = useStoreScoreReport(range.from, range.to, orgWide && viewBy === 'store');
  const active = viewBy === 'store' ? storeReport : peopleReport;

  const measures: Measure[] = measureView === 'all' ? [...MEASURE_KEYS] : [measureView];

  const source = viewBy === 'person' ? peopleReport.data?.people : viewBy === 'department' ? peopleReport.data?.departments : storeReport.data;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (source ?? [])
      .filter((r) => viewBy !== 'person' || !departmentFilter || r.department === departmentFilter)
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
  }, [source, query, sortKey, ascending, viewBy, departmentFilter]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAscending((v) => !v);
    // Names read A to Z; a figure starts worst first.
    else { setSortKey(key); setAscending(true); }
  };

  const pickView = (next: ViewBy) => {
    setViewBy(next);
    setQuery('');
    if (next !== 'person') setDepartmentFilter(null);
    patch({ view: next === 'department' ? null : next, open: null });
    setOpenId(null);
  };
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
  const seePeople = useCallback((row: ScoreReportRow) => {
    setViewBy('person');
    setQuery('');
    setDepartmentFilter(row.name);
    setOpenId(null);
    patch({ view: 'person', open: null });
  }, [patch]);

  const exportHead = (m: Module) => [
    `${MODULES.find((x) => x.key === m)!.label} due`, `${MODULES.find((x) => x.key === m)!.label} done`,
    ...MEASURE_KEYS.map((ms) => `${MODULES.find((x) => x.key === m)!.label} ${MEASURE_NAME[m][ms].toLowerCase()} %`),
    `${MODULES.find((x) => x.key === m)!.label} late`, `${MODULES.find((x) => x.key === m)!.label} not done`,
  ];
  // The table as sorted, searched and narrowed on screen, every measure, with the counts behind them.
  const exportRows = (): TableRows => {
    const head: string[] = [NAME_HEAD[viewBy], ...(viewBy === 'person' ? ['Department'] : []), 'Overall score'];
    for (const m of MODULES) head.push(...exportHead(m.key));
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
  // Admin and PC also see the whole organisation in three cards above the table. The columns carry the
  // same plain names as the cards: compliance is "answers right" for checklists, "met deadline" otherwise.
  const orgExport: ExportSource[] = orgWide
    ? [{
        label: 'Whole organisation',
        filename: 'scorecard-organisation',
        title: exportTitle({ what: 'Scorecard, whole organisation', from: range.from, to: range.to, period: range.label }),
        getRows: async () => {
          const org = await queryClient.fetchQuery<Scores>(scoreQuery('org', undefined, range.from, range.to));
          const head = MODULE_EXPORT_HEAD.map((h) => (h === 'Compliance %' ? 'Compliance % (checklist: answers right; tickets and delegations: met deadline)' : h === 'On time %' ? 'On time % (of finished)' : h));
          return [['Module', ...head], ...MODULES.map((m) => [m.label, ...moduleExportCells(org, m.key)])];
        },
      }]
    : [];

  const openRow = rows.find((r) => r.id === openId) ?? null;
  const drillWindow = useMemo(() => ({ from: range.from, to: range.to, period: periodOf(range.from, range.to, orgToday) }), [range.from, range.to, orgToday]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <h1 className="sr-only">Scorecard</h1>

      {/* The same period bar as the Overview, reading and writing the same address, so the period carries over. */}
      <AnalyticsControlBar
        groupBy="week"
        onGroupByChange={() => undefined}
        hideGroupBy
        range={pickedRange}
        onRangeChange={handleRange}
        updatedAt={updatedAt}
        isRefreshing={isRefreshing}
        onRefresh={() => void refresh()}
      />

      {orgWide && <OrgSummary from={range.from} to={range.to} />}

      <section aria-label={`By ${VIEW_LABEL[viewBy].toLowerCase()}`} className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3 sm:p-4')}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <PeriodTabControl value={viewBy} options={views} labels={VIEW_LABEL} onChange={pickView} fill dense className="lg:w-80" />
          {/* Every measure is already in the cards and the popup on a phone, so the measure tabs are for wider screens. */}
          <PeriodTabControl value={measureView} options={['all', 'completion', 'compliance', 'ontime'] as const} labels={MEASURE_VIEW_LABEL} onChange={setMeasureView} fill dense className="hidden md:block lg:w-96" />
          <div className="flex items-center gap-2 lg:ml-auto">
            <label className="relative block flex-1 lg:w-56 lg:flex-none">
              <span className="sr-only">Search {VIEW_LABEL[viewBy].toLowerCase()}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-light" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${VIEW_LABEL[viewBy].toLowerCase()}`}
                className="h-9 pointer-coarse:min-h-11 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-base text-text outline-none transition-colors placeholder:text-text-light focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:text-sm"
              />
            </label>
            <ExportMenu
              disabled={!rows.length}
              aria-label={`Export the scorecard by ${VIEW_LABEL[viewBy].toLowerCase()}`}
              label={`By ${VIEW_LABEL[viewBy].toLowerCase()}`}
              filename={`scorecard-${viewBy}`}
              title={exportTitle({ what: `Scorecard, ${VIEW_LABEL[viewBy]}`, from: range.from, to: range.to, period: range.label, filters: { Department: viewBy === 'person' ? departmentFilter : null, Search: query.trim() } })}
              getRows={exportRows}
              more={orgExport}
            />
          </div>
        </div>

        {viewBy === 'person' && departmentFilter && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDepartmentFilter(null)}
              aria-label={`Show people from every department, not only ${departmentFilter}`}
              className="inline-flex min-h-9 pointer-coarse:min-h-11 max-w-full items-center gap-1.5 rounded-lg border border-border px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <span className="line-clamp-2 text-left">Department: {departmentFilter}</span>
              <X className="size-3.5 shrink-0" aria-hidden="true" />
            </button>
          </div>
        )}

        {active.isError && !active.data ? (
          <InlineError message="Could not load the scorecard." onRetry={() => void active.refetch()} />
        ) : !active.data ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading the scorecard">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            size="compact"
            icon={SearchX}
            title={query.trim() || departmentFilter ? 'No matches' : 'Nothing was due in this period'}
            description={query.trim() ? `Nothing matches "${query.trim()}".` : departmentFilter ? `Nobody in ${departmentFilter} had work due in this period.` : 'Try another period.'}
          />
        ) : (
          // No dim while the next period loads: the old numbers stay until the new ones land.
          <div>
            {/* Phone: one card per row. */}
            <ol className="flex flex-col gap-2 md:hidden">
              {rows.map((r, i) => <MobileRow key={r.id} row={r} rank={i + 1} onOpen={() => setOpenId(r.id)} />)}
            </ol>

            {/* Tablet and desktop: a sortable table, the modules as column groups. The header stays in view while the rows scroll. */}
            <div className="hidden max-h-[70vh] overflow-auto rounded-lg border border-border md:block">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Scorecard by {VIEW_LABEL[viewBy].toLowerCase()}, {range.label}</caption>
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th scope="col" rowSpan={measures.length > 1 ? 2 : 1} className="sticky left-0 z-30 bg-surface-hover px-3 py-2 align-bottom">
                      <button type="button" onClick={() => sortBy('name')} className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center gap-0.5 t-meta font-display font-semibold text-text-secondary hover:text-text">
                        {NAME_HEAD[viewBy]}
                        {sortKey === 'name' && (ascending ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                      </button>
                    </th>
                    {measures.length > 1 ? (
                      MODULES.map((m) => <th key={m.key} scope="colgroup" colSpan={measures.length} className="border-l border-border/60 bg-surface-hover px-2 pt-2 text-center t-meta font-display font-bold text-text">{m.label}</th>)
                    ) : (
                      MODULES.map((m) => <SortHead key={m.key} label={`${m.label}, ${MEASURE_NAME[m.key][measures[0]].toLowerCase()}`} sortKey={`${m.key}.${measures[0]}`} active={sortKey} ascending={ascending} onSort={sortBy} className="border-l border-border/60" />)
                    )}
                    <SortHead label="Overall score" sortKey="overall" active={sortKey} ascending={ascending} onSort={sortBy} className="border-l border-border/60" />
                  </tr>
                  {measures.length > 1 && (
                    <tr>
                      {MODULES.flatMap((m) => measures.map((ms, i) => (
                        <SortHead key={`${m.key}.${ms}`} label={MEASURE_NAME[m.key][ms]} sortKey={`${m.key}.${ms}`} active={sortKey} ascending={ascending} onSort={sortBy} className={i === 0 ? 'border-l border-border/60' : ''} />
                      )))}
                      <th scope="col" aria-hidden="true" className="border-l border-border/60 bg-surface-hover" />
                    </tr>
                  )}
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setOpenId(r.id)} className="group cursor-pointer border-t border-border/60">
                      <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 font-normal transition-colors group-hover:bg-surface-hover">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }} className="flex min-h-9 pointer-coarse:min-h-11 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
                          <span className="t-card font-display font-semibold text-text line-clamp-2">{r.name}</span>
                          {viewBy === 'person' && r.department && <span className="t-meta text-text-muted line-clamp-2">{r.department}</span>}
                        </button>
                      </th>
                      {MODULES.flatMap((m) => measures.map((ms, i) => (
                        <td key={`${m.key}.${ms}`} className={cn('px-2 py-2 text-center text-sm transition-colors group-hover:bg-surface-hover', i === 0 && 'border-l border-border/60')}>
                          {r[m.key].due === 0 ? <span className="text-text-light">-</span> : <Pct value={valueOf(r[m.key], ms)} />}
                        </td>
                      )))}
                      <td className="border-l border-border/60 px-3 py-2 text-center t-card font-display transition-colors group-hover:bg-surface-hover"><Pct value={r.overall} strong /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* The long explanation is for wider screens; a phone gets the same words behind a "?". */}
        <div className="flex items-start gap-2">
          <p className="hidden t-meta text-text-muted sm:block">
            Completion: done out of what was due (a checklist run counts once all its questions are done). Answers right (checklists): the share of checked answers that were right. Met deadline (tickets and delegations): of everything due, the share handed in by its deadline, finished or waiting for approval. On time (of finished): of what was finished, the share finished before its cutoff. Overall score: completion and compliance of every module with work due, counted equally. Worst first; a dash means nothing was due. Work with no department is on the No department row, work with no assignee on Unassigned, and people who have left are marked (left).
          </p>
          <span className="sm:hidden">
            <InfoHint label="What do these figures mean?">
              <p><strong className="text-text">Completion</strong>: done out of what was due.</p>
              <p className="mt-1.5"><strong className="text-text">Answers right</strong> (checklists) and <strong className="text-text">Met deadline</strong> (tickets, delegations): the share that was right, or handed in on time.</p>
              <p className="mt-1.5"><strong className="text-text">On time (of finished)</strong>: of what was finished, the share finished before its cutoff.</p>
              <p className="mt-1.5"><strong className="text-text">Overall score</strong>: completion and compliance counted equally. A dash means nothing was due.</p>
            </InfoHint>
          </span>
        </div>
      </section>

      <RowDetail row={openRow} viewBy={viewBy} windowLabel={range.label} window={drillWindow} orgWide={orgWide} onClose={closeRow} onSeePeople={seePeople} />
    </div>
  );
};
