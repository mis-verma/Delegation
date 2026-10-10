import { memo, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Search, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button, EmptyState, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { useAuth } from '../../../context/AuthContext';
import { scoreApi, type ScoreReportRow, type Scores } from '../../../api/scores';
import { csvBlob, xlsxBlob, downloadBlob, stampedFilename, type TableRows } from '../../../lib/exportTable';
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
  { key: 'completion', label: 'Completion', short: 'Done' },
  { key: 'compliance', label: 'Compliance', short: 'Right' },
  { key: 'ontime', label: 'On time', short: 'On time' },
];
const VIEW_LABEL: Record<ViewBy, string> = { department: 'Departments', store: 'Stores', person: 'People' };
const NAME_HEAD: Record<ViewBy, string> = { department: 'Department', store: 'Store', person: 'Person' };
const MEASURE_VIEW_LABEL: Record<MeasureView, string> = { all: 'All', completion: 'Completion', compliance: 'Compliance', ontime: 'On time' };
const PERIOD_OPTIONS: readonly ScorePeriod[] = ['week', 'month', 'quarter', 'year'];

type ModuleScore = ScoreReportRow['checklist'] | ScoreReportRow['ticket'] | ScoreReportRow['delegation'];

const valueOf = (m: ModuleScore, measure: Measure): number | null =>
  measure === 'completion' ? m.completionPct : measure === 'compliance' ? m.compliancePct : m.onTimePct;

/** Completion and compliance of every module that had work due, counted equally. */
const overallOf = (row: Pick<ScoreReportRow, Module>): number | null => {
  const values: number[] = [];
  for (const { key } of MODULES) {
    const m = row[key];
    if (m.due <= 0) continue;
    if (m.completionPct !== null) values.push(m.completionPct);
    if (m.compliancePct !== null) values.push(m.compliancePct);
  }
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
};

/** What was late or not done, in words, per module. */
const delayOf = (key: Module, m: ModuleScore): { done: number; late: number; missed: number } => {
  if (key === 'checklist') {
    const c = m as ScoreReportRow['checklist'];
    return { done: c.completed, late: Math.max(0, c.completed - c.onTime), missed: c.missed };
  }
  if (key === 'ticket') {
    const t = m as ScoreReportRow['ticket'];
    return { done: t.closed, late: t.late, missed: Math.max(0, t.due - t.closed) };
  }
  const d = m as ScoreReportRow['delegation'];
  return { done: d.done, late: Math.max(0, d.done - d.onTime), missed: d.overdue };
};

const Pct = ({ value, strong }: { value: number | null; strong?: boolean }) => (
  <span className={cn('tabular-nums', strong ? 'font-bold' : 'font-semibold', value === null ? 'text-text-light' : rateToneClass(value))}>
    {value === null ? '-' : `${value}%`}
  </span>
);

// ---------------------------------------------------------------------------------------------
// The organisation in three cards
// ---------------------------------------------------------------------------------------------

const ModuleSummary = ({ label, module, data }: { label: string; module: Module; data: ModuleScore }) => {
  const { done, late, missed } = delayOf(module, data);
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
            <dd className="text-xl font-display"><Pct value={valueOf(data, m.key)} strong /></dd>
          </div>
        ))}
      </dl>
      <p className="t-meta text-text-muted tabular-nums">
        {done} done · <span className={late ? 'text-warning font-semibold' : ''}>{late} late</span> · <span className={missed ? 'text-danger font-semibold' : ''}>{missed} not done</span>
      </p>
    </div>
  );
};

const OrgSummary = ({ from, to }: { from: string; to: string }) => {
  const query = useQuery<Scores>({
    queryKey: ['scores', 'org', 'me', from, to],
    queryFn: () => scoreApi.get({ scope: 'org', from, to }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  if (query.isError && !query.data) return <InlineError message="Could not load the organisation totals." onRetry={() => void query.refetch()} />;
  if (!query.data) {
    return <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{MODULES.map((m) => <Skeleton key={m.key} className="h-40 rounded-2xl" />)}</div>;
  }
  return (
    <section aria-label="Whole organisation" className={cn('grid grid-cols-1 gap-3 md:grid-cols-3 transition-opacity', query.isFetching && 'opacity-60')}>
      {MODULES.map((m) => <ModuleSummary key={m.key} label={m.label} module={m.key} data={query.data[m.key]} />)}
    </section>
  );
};

// ---------------------------------------------------------------------------------------------
// One row's detail
// ---------------------------------------------------------------------------------------------

const linksFor = (viewBy: ViewBy, id: string): Record<Module, string> => {
  if (viewBy === 'person') return { checklist: '/admin/checklist-compliance', ticket: `/tickets?quickFilter=delayed&assigneeIds=${id}`, delegation: `/tasks?quickFilter=delayed&assigneeIds=${id}` };
  if (viewBy === 'department') return { checklist: '/admin/checklist-weekly', ticket: '/tickets?quickFilter=delayed', delegation: `/tasks?quickFilter=delayed&departmentId=${id}` };
  return { checklist: '/admin/checklist-weekly', ticket: '/tickets?quickFilter=delayed', delegation: `/tasks?quickFilter=delayed&storeId=${id}` };
};

const RowDetail = ({ row, viewBy, windowLabel, onClose }: { row: ScoreReportRow | null; viewBy: ViewBy; windowLabel: string; onClose: () => void }) => {
  const links = row ? linksFor(viewBy, row.id) : null;
  return (
    <Dialog open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg gap-4 p-5 sm:p-6">
        {row && links && (
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
                const { done, late, missed } = delayOf(key, m);
                return (
                  <div key={key} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="t-card font-display font-semibold text-text">{label}</span>
                      {m.due > 0 && (
                        <Link viewTransition to={links[key]} className="inline-flex min-h-9 items-center gap-0.5 rounded-lg px-1.5 t-meta font-display font-semibold text-primary-600 hover:underline dark:text-primary-400">
                          Open <ChevronRight className="size-3.5" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                    {m.due === 0 ? (
                      <p className="t-meta text-text-muted">Nothing due in this period</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {MEASURES.map((ms) => (
                            <div key={ms.key} className="flex flex-col">
                              <span className="t-meta text-text-muted">{ms.label}</span>
                              <span className="text-lg font-display"><Pct value={valueOf(m, ms.key)} strong /></span>
                            </div>
                          ))}
                        </div>
                        <p className="t-meta text-text-muted tabular-nums">
                          {m.due} due · {done} done · <span className={late ? 'text-warning font-semibold' : ''}>{late} late</span> · <span className={missed ? 'text-danger font-semibold' : ''}>{missed} not done</span>
                        </p>
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
};

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
    <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2.5 rounded-lg border border-border bg-surface p-3 text-left outline-none transition-[border-color,transform] duration-150 hover:border-border-hover active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40">
      <span className="flex items-center gap-2.5">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-hover t-meta font-display font-bold tabular-nums text-text-secondary">{rank}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-display font-semibold text-text">{row.name}</span>
          {row.department && <span className="block truncate t-meta text-text-muted">{row.department}</span>}
        </span>
        <span className="text-lg font-display"><Pct value={row.overall} strong /></span>
      </span>
      <span className="grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-center">
        {MODULES.map(({ key, label }) => (
          <span key={key} className="flex flex-col gap-0.5">
            <span className="t-meta text-text-muted">{label}</span>
            {row[key].due === 0
              ? <span className="t-meta text-text-light">-</span>
              : <span className="t-meta">{measures.map((ms, i) => <span key={ms}>{i > 0 && <span className="text-text-light"> / </span>}<Pct value={valueOf(row[key], ms)} /></span>)}</span>}
          </span>
        ))}
      </span>
    </button>
  </li>
));
MobileRow.displayName = 'ScorecardMobileRow';

/**
 * Checklists, tickets and delegations side by side for every department, store or person, on the three
 * measures that matter: completion (done out of what was due), compliance (done right, or done in time)
 * and on time. Admin and PC also see the whole organisation on top; a department head sees their own
 * department and its people. Sort any column, search, open a row for its counts and the late items, export.
 */
export const ScorecardPage = () => {
  const { user } = useAuth();
  const orgWide = user?.role === 'ADMIN' || user?.role === 'PC';
  const views: ViewBy[] = orgWide ? ['department', 'store', 'person'] : ['department', 'person'];

  const [period, setPeriod] = useState<ScorePeriod>('month');
  const [offset, setOffset] = useState(0);
  const [viewBy, setViewBy] = useState<ViewBy>('department');
  const [measureView, setMeasureView] = useState<MeasureView>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [ascending, setAscending] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const range = windowFor(period, offset);
  const report = useQuery({
    queryKey: ['scores', 'scorecard', range.from, range.to, viewBy === 'store'],
    queryFn: () => scoreApi.report({ from: range.from, to: range.to, stores: viewBy === 'store' }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const measures: Measure[] = measureView === 'all' ? ['completion', 'compliance', 'ontime'] : [measureView];

  const rows = useMemo(() => {
    const source = viewBy === 'person' ? report.data?.people : viewBy === 'department' ? report.data?.departments : report.data?.stores;
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
  }, [report.data, viewBy, query, sortKey, ascending]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAscending((v) => !v);
    else { setSortKey(key); setAscending(key === 'name'); }
  };

  const exportRows = (format: 'csv' | 'xlsx') => {
    const head = ['Name', ...(viewBy === 'person' ? ['Department'] : []), 'Overall %'];
    for (const m of MODULES) head.push(`${m.label} due`, `${m.label} completion %`, `${m.label} compliance %`, `${m.label} on time %`, `${m.label} late`, `${m.label} not done`);
    const body = rows.map((r) => {
      const cells: (string | number | null)[] = [r.name, ...(viewBy === 'person' ? [r.department] : []), r.overall];
      for (const m of MODULES) {
        const s = r[m.key];
        const d = delayOf(m.key, s);
        cells.push(s.due, s.completionPct, s.compliancePct, s.onTimePct, d.late, d.missed);
      }
      return cells;
    });
    const table: TableRows = [[`Scorecard by ${VIEW_LABEL[viewBy].toLowerCase()}`], ['Period', `${range.label} (${range.from} to ${range.to})`], [], head, ...body];
    downloadBlob(format === 'csv' ? csvBlob(table) : xlsxBlob(table, 'Scorecard'), stampedFilename(`scorecard-${viewBy}`, format));
    toast.success(`Exported ${rows.length} ${VIEW_LABEL[viewBy].toLowerCase()}`);
  };

  const openRow = rows.find((r) => r.id === openId) ?? null;
  const periodWord = PERIOD_LABEL[period].toLowerCase();

  return (
    <div className="flex flex-col gap-4 w-full">
      <h1 className="sr-only">Scorecard</h1>

      {/* Period, then the view and the measure. */}
      <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3')}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <PeriodTabControl value={period} options={PERIOD_OPTIONS} labels={PERIOD_LABEL} onChange={(next) => { setPeriod(next); setOffset(0); }} fill dense />
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-hover/30 p-1 lg:w-80">
            <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${periodWord}`} className="inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="min-w-0 flex-1 truncate text-center text-sm font-display font-semibold text-text">{range.label}</span>
            <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label={`Next ${periodWord}`} className="inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-40 disabled:hover:bg-transparent">
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!rows.length} aria-label="Export" className="shrink-0 pointer-coarse:min-h-11">
                  <Download size={14} aria-hidden="true" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportRows('csv')} className="gap-2"><FileText size={14} />CSV (.csv)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportRows('xlsx')} className="gap-2"><FileSpreadsheet size={14} />Excel (.xlsx)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {report.isError && !report.data ? (
          <InlineError message="Could not load the scorecard." onRetry={() => void report.refetch()} />
        ) : !report.data ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading the scorecard">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState size="compact" icon={SearchX} title={query.trim() ? 'No matches' : `Nothing was due in this ${periodWord}`} description={query.trim() ? `Nothing matches "${query.trim()}".` : 'Try another period.'} />
        ) : (
          <div className={cn('transition-opacity', report.isFetching && 'opacity-60')}>
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
                    <SortHead label="Overall" sortKey="overall" active={sortKey} ascending={ascending} onSort={sortBy} className="border-l border-border/60" />
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
          Completion: done out of what was due (a checklist run counts once all its questions are done). Compliance: done right (checklists) or done in time (tickets and delegations). On time: of what was finished, the share finished before its cutoff. Overall: completion and compliance counted equally. A dash means nothing was due.
        </p>
      </section>

      <RowDetail row={openRow} viewBy={viewBy} windowLabel={range.label} onClose={() => setOpenId(null)} />
    </div>
  );
};
