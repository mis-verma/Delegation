import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ChevronRight, Search, SearchX, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton, type ExportSource } from '../../../components';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui/dialog';
import { useAuth } from '../../../context/AuthContext';
import { NO_DEPARTMENT_ROW_ID, UNASSIGNED_ROW_ID, type ScoreReportRow, type Scores } from '../../../api/scores';
import { MODULE_LABEL, SCORE_LABEL, SCORE_LABEL_SHORT, complianceLabel } from '../../../lib/scoreLabels';
import { exportTitle, type TableRows } from '../../../lib/exportTable';
import { MODULE_EXPORT_HEAD, moduleCounts, moduleExportCells, moduleOverall, overallOf } from '../../dashboard/scoreMetrics';
import { checklistDrillHref, delegationDrillHref, ticketDrillHref, type DrillKind, type DrillSubject } from '../../dashboard/scoreDrill';
import { CARD_PAD, DRILL_LINK_CLASS, SEARCH_INPUT_CLASS, TABLE_FRAME_CLASS } from '../../scores/controlStyles';
import { HintPopover, HowCalculated } from '../../scores/HowCalculated';
import { MobileScoreRow } from '../../scores/MobileScoreRow';
import { ModuleFigures } from '../../scores/ModuleFigures';
import { CountsLine, ScorePct as Pct } from '../../scores/ScorePct';
import { DepartmentLine, NumCell, SortHead } from '../../scores/scoreTableParts';
import { explorerRowToReportRow, explorerRowToScores } from '../../scores/explorerAdapters';
import { scoreExplorerQuery, useScoreExplorer } from '../../scores/useScoreExplorer';
import { useScoreWindow } from '../../scores/useScoreWindow';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { windowFor, type ScorePeriod } from '../../dashboard/scorePeriods';
import { AnalyticsControlBar } from './GroupByControl';
import { useAnalyticsRefresh } from './useAnalyticsQueries';
import { useSearchPatch } from './useAnalyticsWindow';

type ViewBy = 'department' | 'store' | 'person';
type Module = 'checklist' | 'ticket' | 'delegation';
type Measure = 'completion' | 'compliance' | 'ontime';
type MeasureView = 'all' | Measure;
type SortKey = 'name' | 'overall' | `${Module}.${Measure}`;

const MODULES: { key: Module; label: string }[] = [
  { key: 'checklist', label: MODULE_LABEL.checklist },
  { key: 'ticket', label: MODULE_LABEL.ticket },
  { key: 'delegation', label: MODULE_LABEL.delegation },
];
const MEASURE_KEYS: readonly Measure[] = ['completion', 'compliance', 'ontime'];
// One plain name per figure, from the one label dictionary, the same in the cards, the table, the popup and the exports.
const measureName = (module: Module, measure: Measure): string =>
  measure === 'completion' ? SCORE_LABEL.completion : measure === 'compliance' ? complianceLabel(module) : SCORE_LABEL.onTime;
const VIEW_LABEL: Record<ViewBy, string> = { department: 'Departments', store: 'Stores', person: 'People' };
const NAME_HEAD: Record<ViewBy, string> = { department: 'Department', store: 'Store', person: 'Person' };
const MEASURE_VIEW_LABEL: Record<MeasureView, string> = { all: 'All', completion: SCORE_LABEL.completion, compliance: SCORE_LABEL.compliance, ontime: SCORE_LABEL_SHORT.onTime };
const CATCH_ALL_IDS: readonly string[] = [NO_DEPARTMENT_ROW_ID, UNASSIGNED_ROW_ID];

type ModuleScore = ScoreReportRow['checklist'] | ScoreReportRow['ticket'] | ScoreReportRow['delegation'];

const valueOf = (m: ModuleScore, measure: Measure): number | null =>
  measure === 'completion' ? m.completionPct : measure === 'compliance' ? m.compliancePct : m.onTimePct;

/** What was done, late or not done, per module: the shared rule (late = finished after the deadline). */
const delayOf = (row: Pick<ScoreReportRow, Module>, key: Module) => {
  const { done, late, notDone } = moduleCounts(row, key);
  return { done, late, missed: notDone };
};

// ---------------------------------------------------------------------------------------------
// The organisation in three cards
// ---------------------------------------------------------------------------------------------

const ModuleSummary = ({ label, module, scores }: { label: string; module: Module; scores: Scores }) => {
  const data = scores[module];
  const { done, late, missed } = delayOf(scores, module);
  return (
    <div className={cn(PANEL_CLASS, 'flex flex-col gap-4', CARD_PAD)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h3 className="t-card font-display font-bold text-text">{label}</h3>
          <span className="t-meta text-text-muted tabular-nums">{data.due} due</span>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="t-figure font-display"><Pct value={moduleOverall(scores, module)} strong /></span>
          <span className="inline-flex items-center gap-1 t-meta text-text-muted">{SCORE_LABEL.overall}<HowCalculated figure="overall" module={module} /></span>
        </div>
      </div>
      <ModuleFigures module={module} completion={valueOf(data, 'completion')} compliance={valueOf(data, 'compliance')} onTime={valueOf(data, 'ontime')} />
      <CountsLine done={done} late={late} notDone={missed} />
    </div>
  );
};

// The organisation is the explorer's total row of the department view (the same request as the Departments table).
const OrgSummary = ({ from, to }: { from: string; to: string }) => {
  const query = useScoreExplorer({ from, to, view: 'department' });
  const data = query.data;
  const scores = useMemo<Scores | null>(() => (data ? explorerRowToScores(data.total, 'org', data.window) : null), [data]);
  if (query.isError && !scores) return <InlineError message="Could not load the organisation totals." onRetry={() => void query.refetch()} />;
  if (!scores) {
    return <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{MODULES.map((m) => <Skeleton key={m.key} className="h-32 rounded-2xl sm:h-44" />)}</div>;
  }
  // No dim while the next period loads: the old numbers stay as they are until the new ones land.
  return (
    <section aria-label="Whole organisation" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {MODULES.map((m) => <ModuleSummary key={m.key} label={m.label} module={m.key} scores={scores} />)}
    </section>
  );
};

// ---------------------------------------------------------------------------------------------
// One row's detail
// ---------------------------------------------------------------------------------------------

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
  // The run history has no "finished late" filter, so a checklist's late link opens ALL its finished runs, and the label
  // says so instead of promising only the late ones.
  if (late > 0) links.push({ label: key === 'checklist' ? `All finished runs (${late} of them late)` : `Late (${late})`, href: href('late') });
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
  /** A head's People view is already their own department, so there is nothing to narrow. */
  canNarrow: boolean;
}

const RowDetail = ({ row, viewBy, windowLabel, window, orgWide, onClose, onSeePeople, canNarrow }: RowDetailProps) => (
  <Dialog open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-lg gap-4 p-5 sm:p-6">
      {row && (
        <>
          <div className="flex flex-col gap-0.5 pr-10">
            <DialogTitle className="t-section font-display font-bold text-text">{row.name}</DialogTitle>
            {viewBy === 'person' && <DepartmentLine name={row.department} />}
            <DialogDescription className="t-meta text-text-muted">{windowLabel}</DialogDescription>
          </div>
          <div className="flex flex-col gap-3">
            {MODULES.map(({ key, label }) => {
              const m = row[key];
              const { done, late, missed } = delayOf(row, key);
              // The catch-all rows have no one person, department or store behind them, so no list to open.
              const links = m.due > 0 && !CATCH_ALL_IDS.includes(row.id) ? drillLinksFor(orgWide, { kind: viewBy, id: row.id }, window, row, key) : [];
              return (
                <div key={key} className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="t-card font-display font-bold text-text">{label}</h3>
                    {m.due > 0 && <span className="t-meta text-text-muted">Overall score <Pct value={moduleOverall(row, key)} strong /></span>}
                  </div>
                  {m.due === 0 ? (
                    <p className="t-meta text-text-muted">Nothing due in this period</p>
                  ) : (
                    <>
                      <ModuleFigures module={key} completion={valueOf(m, 'completion')} compliance={valueOf(m, 'compliance')} onTime={valueOf(m, 'ontime')} />
                      <CountsLine due={m.due} done={done} late={late} notDone={missed} />
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
          {viewBy === 'department' && canNarrow && !CATCH_ALL_IDS.includes(row.id) && (
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
  // THE window for every score page: the picked dates, else the default window, never later than today.
  const { from, to, label: windowLabel, today: orgToday, range: pickedRange, handleRange } = useScoreWindow();
  const { updatedAt, isRefreshing, refresh } = useAnalyticsRefresh();

  const [viewBy, setViewBy] = useState<ViewBy>(() => {
    const requested = searchParams.get('view');
    return views.find((v) => v === requested) ?? 'department';
  });
  const [measureView, setMeasureView] = useState<MeasureView>('all');
  const [query, setQuery] = useState('');
  // A department picked from its popup ("See people"): the People view shows only its people (explorer parentId).
  const [departmentFilter, setDepartmentFilter] = useState<{ id: string; name: string } | null>(null);
  // Worst first by default: the rows that need attention lead, rows with nothing due sink to the bottom.
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [ascending, setAscending] = useState(true);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get('open'));

  // One explorer request per view and window (people narrowed by the department when one was picked). The same
  // cache key serves every page that asks for the same cut, so the numbers cannot differ between pages.
  const parentId = viewBy === 'person' ? departmentFilter?.id : undefined;
  const explorer = useScoreExplorer({ from, to, view: viewBy, parentId });
  // While another view or department loads the old rows would sit under the wrong heading, so only an answer for what
  // is asked for is shown (a new window keeps the previous figures, with the Updating line).
  const data = explorer.data && explorer.data.view === viewBy && (explorer.data.parent?.id ?? null) === (parentId ?? null) ? explorer.data : undefined;
  const updating = explorer.updating && !!data;
  // The server locks a head to their own department.
  const departmentLocked = data?.scope.departmentLocked ?? !orgWide;

  const measures: Measure[] = measureView === 'all' ? [...MEASURE_KEYS] : [measureView];

  const source = useMemo<ScoreReportRow[]>(() => (data ? data.rows.map(explorerRowToReportRow) : []), [data]);
  // Work with nobody assigned: its own row under the people, never ranked.
  const unassignedRow = useMemo<ScoreReportRow | null>(
    () => (viewBy === 'person' && data?.unassigned ? { ...explorerRowToReportRow(data.unassigned), id: UNASSIGNED_ROW_ID, name: 'Unassigned' } : null),
    [data, viewBy],
  );
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = source
      .filter((r) => !needle || r.name.toLowerCase().includes(needle))
      .map((r) => ({ ...r, overall: r.overall !== undefined ? r.overall : overallOf(r) }));
    const value = (r: (typeof list)[number]): number | string | null => {
      if (sortKey === 'name') return r.name.toLowerCase();
      if (sortKey === 'overall') return r.overall;
      const [mod, ms] = sortKey.split('.') as [Module, Measure];
      return r[mod].due > 0 ? valueOf(r[mod], ms) : null;
    };
    list.sort((a, b) => {
      const x = value(a), y = value(b);
      // Rows with no figure sink to the bottom whichever way the list is sorted.
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      const diff = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
      return (ascending ? diff : -diff) || a.name.localeCompare(b.name);
    });
    if (unassignedRow && (!needle || unassignedRow.name.toLowerCase().includes(needle))) list.push({ ...unassignedRow, overall: unassignedRow.overall ?? null });
    return list;
  }, [source, unassignedRow, query, sortKey, ascending]);

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
    setDepartmentFilter({ id: row.id, name: row.name });
    setOpenId(null);
    patch({ view: 'person', open: null });
  }, [patch]);

  const exportHead = (m: Module) => [
    `${MODULES.find((x) => x.key === m)!.label} due`, `${MODULES.find((x) => x.key === m)!.label} done`,
    ...MEASURE_KEYS.map((ms) => `${MODULES.find((x) => x.key === m)!.label} ${measureName(m, ms).toLowerCase()} %`),
    `${MODULES.find((x) => x.key === m)!.label} late`, `${MODULES.find((x) => x.key === m)!.label} not done`,
  ];
  // The table as sorted, searched and narrowed on screen, every measure, with the counts behind them.
  const exportRows = (): TableRows => {
    const withDepartment = viewBy === 'person';
    const head: string[] = [NAME_HEAD[viewBy], ...(withDepartment ? ['Department'] : []), SCORE_LABEL.overall];
    for (const m of MODULES) head.push(...exportHead(m.key));
    const body = rows.map((r) => {
      const cells: (string | number | null)[] = [r.name, ...(withDepartment ? [r.department] : []), r.overall];
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
        title: exportTitle({ what: 'Scorecard, whole organisation', from, to, period: windowLabel }),
        getRows: async () => {
          const answer = await queryClient.fetchQuery(scoreExplorerQuery({ from, to, view: 'department' }));
          const org = explorerRowToScores(answer.total, 'org', answer.window);
          const head = MODULE_EXPORT_HEAD.map((h) => (h === 'Compliance %' ? 'Compliance % (checklist: answers right; tickets and delegations: met deadline)' : h));
          return [['Module', ...head], ...MODULES.map((m) => [m.label, ...moduleExportCells(org, m.key)])];
        },
      }]
    : [];

  const openRow = rows.find((r) => r.id === openId) ?? null;
  const drillWindow = useMemo(() => ({ from, to, period: periodOf(from, to, orgToday) }), [from, to, orgToday]);

  return (
    <div className="flex w-full flex-col gap-6">
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

      {orgWide && <OrgSummary from={from} to={to} />}

      <section aria-label={`By ${VIEW_LABEL[viewBy].toLowerCase()}`} className={cn(PANEL_CLASS, 'flex flex-col gap-4', CARD_PAD)}>
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
                className={SEARCH_INPUT_CLASS}
              />
            </label>
            <ExportMenu
              disabled={!rows.length}
              aria-label={`Export the scorecard by ${VIEW_LABEL[viewBy].toLowerCase()}`}
              label={`By ${VIEW_LABEL[viewBy].toLowerCase()}`}
              filename={`scorecard-${viewBy}`}
              title={exportTitle({ what: `Scorecard, ${VIEW_LABEL[viewBy]}`, from, to, period: windowLabel, filters: { Department: viewBy === 'person' ? departmentFilter?.name : null, Search: query.trim() } })}
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
              aria-label={`Show people from every department, not only ${departmentFilter.name}`}
              className="inline-flex min-h-9 pointer-coarse:min-h-11 max-w-full items-center gap-1.5 rounded-lg border border-border px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <span className="line-clamp-2 text-left">Department: {departmentFilter.name}</span>
              <X className="size-3.5 shrink-0" aria-hidden="true" />
            </button>
          </div>
        )}

        {explorer.isError && !data ? (
          <InlineError message="Could not load the scorecard." onRetry={() => void explorer.refetch()} />
        ) : !data ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading the scorecard">
            {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            size="compact"
            icon={SearchX}
            title={query.trim() || departmentFilter ? 'No matches' : 'Nothing was due in this period'}
            description={query.trim() ? `Nothing matches "${query.trim()}".` : departmentFilter ? `Nobody in ${departmentFilter.name} had work due in this period.` : 'Try another period.'}
          />
        ) : (
          // No dim while the next period loads: the old numbers stay until the new ones land.
          <div>
            {/* Phone: one card per row. */}
            <ol className="flex flex-col gap-2 md:hidden">
              {rows.map((r, i) => (
                <MobileScoreRow
                  key={r.id}
                  rank={r.id === UNASSIGNED_ROW_ID ? null : i + 1}
                  title={(
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="block t-card font-display font-semibold leading-snug text-text line-clamp-2">{r.name}</span>
                      {viewBy === 'person' && <DepartmentLine name={r.department} />}
                    </span>
                  )}
                  overall={r.overall}
                  cells={MODULES.map(({ key, label }) => ({ key, label, value: r[key].due === 0 ? null : moduleOverall(r, key) }))}
                  onOpen={() => setOpenId(r.id)}
                />
              ))}
            </ol>

            {/* Tablet and desktop: a sortable table, the modules as column groups. The header stays in view while the rows scroll. */}
            <div className={TABLE_FRAME_CLASS}>
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Scorecard by {VIEW_LABEL[viewBy].toLowerCase()}, {windowLabel}</caption>
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th scope="col" rowSpan={measures.length > 1 ? 2 : 1} className="sticky left-0 z-30 bg-surface-hover px-3 py-2 align-bottom">
                      <button type="button" onClick={() => sortBy('name')} className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center gap-0.5 t-meta font-display font-semibold text-text-secondary hover:text-text">
                        {NAME_HEAD[viewBy]}
                        {sortKey === 'name' && (ascending ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                      </button>
                    </th>
                    <SortHead label={SCORE_LABEL.overall} sortKey="overall" active={sortKey} ascending={ascending} onSort={sortBy} rowSpan={measures.length > 1 ? 2 : 1} className="border-l border-border/60 align-bottom" />
                    {measures.length > 1 ? (
                      MODULES.map((m) => <th key={m.key} scope="colgroup" colSpan={measures.length} className="border-l border-border/60 bg-surface-hover px-3 pt-2 text-right t-meta font-display font-bold text-text">{m.label}</th>)
                    ) : (
                      MODULES.map((m) => <SortHead key={m.key} label={`${m.label}, ${measureName(m.key, measures[0]).toLowerCase()}`} sortKey={`${m.key}.${measures[0]}`} active={sortKey} ascending={ascending} onSort={sortBy} className="border-l border-border/60" />)
                    )}
                  </tr>
                  {measures.length > 1 && (
                    <tr>
                      {MODULES.flatMap((m) => measures.map((ms, i) => (
                        <SortHead key={`${m.key}.${ms}`} label={measureName(m.key, ms)} sortKey={`${m.key}.${ms}`} active={sortKey} ascending={ascending} onSort={sortBy} className={i === 0 ? 'border-l border-border/60' : ''} />
                      )))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setOpenId(r.id)} className="group cursor-pointer border-t border-border/60">
                      <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 font-normal transition-colors group-hover:bg-surface-hover">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }} className="flex min-h-9 pointer-coarse:min-h-11 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
                          <span className="t-card font-display font-semibold text-text line-clamp-2">{r.name}</span>
                          {viewBy === 'person' && <DepartmentLine name={r.department} />}
                        </button>
                      </th>
                      <NumCell className="border-l border-border/60 font-display transition-colors group-hover:bg-surface-hover"><Pct value={r.overall} strong /></NumCell>
                      {MODULES.flatMap((m) => measures.map((ms, i) => (
                        <NumCell key={`${m.key}.${ms}`} className={cn('transition-colors group-hover:bg-surface-hover', i === 0 && 'border-l border-border/60')}>
                          {r[m.key].due === 0 ? <span className="text-text-light">-</span> : <Pct value={valueOf(r[m.key], ms)} />}
                        </NumCell>
                      )))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* The long explanation is for wider screens; a phone gets the same words behind a "?". */}
        <div className="flex flex-col gap-1.5">
          {updating && <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These figures are for the previous period until {windowLabel} loads.</p>}
          <p className="hidden t-meta text-text-muted sm:block">
            Completion: done out of what was due (a checklist run counts once all its questions are done). Answers right (checklists): the share of checked answers that were right. Met deadline (tickets and delegations): of everything due, the share handed in by its deadline, finished or waiting for approval. On time (of finished): of what was finished, the share finished before its cutoff. Overall score: completion and compliance of every module with work due, counted equally. Worst first; a dash means nothing was due. Work with no department is on the No department row, work with no assignee on Unassigned, and people who have left are marked (left).
          </p>
          <span className="sm:hidden">
            <HintPopover label="What do these figures mean?">
              <p><strong className="text-text">{SCORE_LABEL.completion}</strong>: done out of what was due.</p>
              <p><strong className="text-text">{complianceLabel('checklist')}</strong> (checklists) and <strong className="text-text">{complianceLabel('ticket')}</strong> (tickets, delegations): the share that was right, or handed in on time.</p>
              <p><strong className="text-text">{SCORE_LABEL.onTime}</strong>: of what was finished, the share finished before its cutoff.</p>
              <p><strong className="text-text">{SCORE_LABEL.overall}</strong>: completion and the second measure counted equally. A dash means nothing was due.</p>
            </HintPopover>
          </span>
        </div>
      </section>

      <RowDetail row={openRow} viewBy={viewBy} windowLabel={windowLabel} window={drillWindow} orgWide={orgWide} onClose={closeRow} onSeePeople={seePeople} canNarrow={!departmentLocked} />
    </div>
  );
};
