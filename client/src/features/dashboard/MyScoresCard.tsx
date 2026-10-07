import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { ArrowDown, ArrowUp, ChartColumn, ChartLine, ChevronDown, ChevronLeft, ChevronRight, CircleGauge, ClipboardCheck, Download, FileSpreadsheet, FileText, Ticket as TicketIcon, Users, type LucideIcon } from 'lucide-react';
import { Button, Combobox, type ComboboxOption } from '../../components';
import { SemiGauge } from '../../components/semiGauge/SemiGauge';
import { InfoHint } from '../../components/infoHint/InfoHint';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from '../../components/ui/dropdown-menu';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { scoreApi, type ScoreReport, type ScoreReportRow, type Scores, type ScoreScope } from '../../api/scores';
import { csvBlob, xlsxBlob, downloadBlob, stampedFilename, type TableRows } from '../../lib/exportTable';
import { useAssignableUsersQuery, useDepartmentsQuery, useStoresQuery } from '../tickets/hook';
import { PeriodTabControl } from './PeriodTabControl';
import { ScoreBars } from './ScoreBars';
import { ScoreRanking } from './ScoreRanking';
import { METRIC_LABEL, METRIC_OPTIONS, isMetric, numbersFor, type ModuleKey, type ScoreMetric } from './scoreMetrics';
import { ScoreTrend } from './ScoreTrend';
import { DASHBOARD_CARD_CLASS, rateTone, type RateTone } from './dashboardDisplay';
import { PERIODS, PERIOD_LABEL, windowFor, type ScorePeriod } from './scorePeriods';

const SCOPE_LABEL: Record<ScoreScope, string> = { person: 'Person', department: 'Department', store: 'Store' };
type ScoreView = 'bars' | 'dials' | 'trend';
const VIEWS: readonly ScoreView[] = ['bars', 'dials', 'trend'];
const VIEW_LABEL: Record<ScoreView, string> = { bars: 'Bars', dials: 'Dials', trend: 'Trend' };
const VIEW_ICON: Record<ScoreView, LucideIcon> = { bars: ChartColumn, dials: CircleGauge, trend: ChartLine };

// What a person last chose is remembered per account, so the card opens the way they left it.
interface ScorePrefs { view: ScoreView; period: ScorePeriod; compare: boolean; metric: ScoreMetric }
const PREFS_KEY = 'tm-scores-prefs';
const loadPrefs = (userId: string | undefined): Partial<ScorePrefs> => {
  try {
    const raw = localStorage.getItem(`${PREFS_KEY}-${userId ?? 'anon'}`);
    return raw ? (JSON.parse(raw) as Partial<ScorePrefs>) : {};
  } catch {
    return {};
  }
};
const isView = (v: unknown): v is ScoreView => v === 'bars' || v === 'dials' || v === 'trend';
const isPeriod = (v: unknown): v is ScorePeriod => typeof v === 'string' && (PERIODS as readonly string[]).includes(v);
const PICK_PLACEHOLDER: Record<ScoreScope, string> = { person: 'Me', department: 'Pick a department', store: 'Pick a store' };

const RING: Record<RateTone, [string, string]> = {
  success: ['var(--color-success)', 'var(--color-success)'],
  warning: ['var(--color-warning)', 'var(--color-warning)'],
  danger: ['var(--color-danger)', 'var(--color-danger)'],
  neutral: ['var(--color-primary-400)', 'var(--color-primary-700)'],
};

const scoreQuery = (scope: ScoreScope, id: string | undefined, from: string, to: string) => ({
  queryKey: ['scores', scope, id ?? 'me', from, to],
  queryFn: () => scoreApi.get({ scope, id, from, to }),
  staleTime: 60_000,
});

// Column set shared by the department and people tables in the full report.
const REPORT_COLUMNS = [
  'Checklists due', 'Checklists done', 'Checklists missed', 'Checklist completion %', 'Checklist compliance %', 'Checklist on-time %',
  'Tickets due', 'Tickets closed', 'Tickets closed on time', 'Ticket completion %', 'Ticket compliance %', 'Ticket on-time %',
  'Delegations due', 'Delegations done', 'Delegations done on time', 'Delegations overdue', 'Delegation completion %', 'Delegation compliance %', 'Delegation on-time %',
];
const reportCells = (r: ScoreReportRow) => [
  r.checklist.due, r.checklist.completed, r.checklist.missed, r.checklist.completionPct, r.checklist.compliancePct, r.checklist.onTimePct,
  r.ticket.due, r.ticket.closed, r.ticket.onTime, r.ticket.completionPct, r.ticket.compliancePct, r.ticket.onTimePct,
  r.delegation.due, r.delegation.done, r.delegation.onTime, r.delegation.overdue, r.delegation.completionPct, r.delegation.compliancePct, r.delegation.onTimePct,
];

const reportRows = (report: ScoreReport, windowLabel: string): TableRows => [
  ['Checklist, ticket and delegation scores'],
  ['Window', `${windowLabel} (${report.from} to ${report.to})`],
  ['Generated', new Date(report.generatedAt).toLocaleString()],
  [],
  ['Departments'],
  ['Department', ...REPORT_COLUMNS],
  ...report.departments.map((d) => [d.name, ...reportCells(d)]),
  [],
  ['People'],
  ['Name', 'Department', 'Role', ...REPORT_COLUMNS],
  ...report.people.map((p) => [p.name, p.department, p.role ?? '', ...reportCells(p)]),
  [],
  ['Notes'],
  ...report.notes.map((n) => [n]),
];

interface ScoreTileProps {
  title: string;
  icon: typeof Users;
  score: number | null;
  detail: string;
  loading: boolean;
  /** Where the late items for this module live; the whole tile opens it. */
  href?: string | null;
  /** The score now minus the previous period's, shown when Compare is on. */
  change?: number | null;
}

const TONE_PILL: Record<RateTone, { label: string; className: string } | null> = {
  success: { label: 'Good', className: 'bg-success/10 text-success' },
  warning: { label: 'Fair', className: 'bg-warning/10 text-warning' },
  danger: { label: 'Low', className: 'bg-danger/10 text-danger' },
  neutral: null,
};

// On a phone the dial sits left of the title and detail, so three tiles stay short; from `sm` up it is
// the stacked tile with the dial in the middle.
const ScoreTile = ({ title, icon: Icon, score, detail, loading, href, change }: ScoreTileProps) => {
  // A small count still gets its colour: one finished item out of one is a full, green score.
  const tone = score === null ? 'neutral' : rateTone(score, Number.MAX_SAFE_INTEGER);
  const [from, to] = RING[tone];
  const pill = TONE_PILL[tone];
  const tileClass = `grid grid-cols-[7rem_minmax(0,1fr)] grid-rows-[auto_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface-hover/30 p-2.5 sm:flex sm:flex-col sm:items-stretch sm:gap-2 sm:p-3.5 min-w-0 ${href ? 'transition-colors hover:border-border-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40' : ''}`;
  const body = (
    <>
      <div className="col-start-2 row-start-1 self-end flex items-center justify-between gap-2 min-w-0 sm:self-auto">
        <div className="flex items-center gap-2 min-w-0">
          <span className="hidden size-7 shrink-0 items-center justify-center rounded-md bg-primary-500/10 text-primary-600 dark:text-primary-400 sm:inline-flex">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate text-[13px] sm:text-sm font-display font-semibold sm:font-bold text-text">{title}</span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {change != null && change !== 0 && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-display font-bold tabular-nums ${change > 0 ? 'text-success' : 'text-danger'}`} title="Compared with the previous period">
              {change > 0 ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}
              {Math.abs(change)}
            </span>
          )}
          {pill && <span className={`rounded-full px-2 py-0.5 text-xs font-display font-bold ${pill.className}`}>{pill.label}</span>}
        </span>
      </div>
      <SemiGauge
        percent={score ?? 0}
        showFill={score !== null}
        gradientFrom={from}
        gradientTo={to}
        ariaLabel={score === null ? `${title}: no data` : `${title}: ${score} percent`}
        className="col-start-1 row-span-2 row-start-1 sm:mx-auto sm:max-w-64"
      >
        <span className="font-display text-lg sm:text-3xl font-extrabold leading-none text-text">{score === null ? '–' : `${score}%`}</span>
      </SemiGauge>
      <p className="col-start-2 row-start-2 self-start text-xs font-medium text-text-muted sm:text-center sm:min-h-8">
        {loading ? 'Loading' : score === null ? 'Nothing was due' : detail}
      </p>
    </>
  );
  return href ? <Link to={href} aria-label={`${title}: open the late items`} className={tileClass}>{body}</Link> : <div className={tileClass}>{body}</div>;
};

/**
 * Checklist, ticket and delegation score for a day, week, month, quarter or year. Everyone sees their
 * own. A department head can also open their own department. Admin and PC can open any person,
 * department or store.
 */
export const MyScoresCard = () => {
  const { user } = useAuth();
  const role = user?.role;
  const orgWide = role === 'ADMIN' || role === 'PC';
  const isHod = role === 'MANAGER' || role === 'SENIOR';
  const scopes = useMemo<ScoreScope[]>(
    () => (orgWide ? ['person', 'department', 'store'] : isHod ? ['person', 'department'] : ['person']),
    [orgWide, isHod],
  );
  const canPickPerson = !!role && !OWN_SCOPE_ROLES.includes(role);
  const canExportReport = orgWide || isHod;

  const [scope, setScope] = useState<ScoreScope>('person');
  const initialPrefs = useMemo(() => loadPrefs(user?.id), [user?.id]);
  const [period, setPeriodState] = useState<ScorePeriod>(() => (isPeriod(initialPrefs.period) ? initialPrefs.period : 'month'));
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState('');
  const [exporting, setExporting] = useState(false);
  const [view, setViewState] = useState<ScoreView>(() => (isView(initialPrefs.view) ? initialPrefs.view : 'bars'));
  const [compare, setCompareState] = useState<boolean>(() => initialPrefs.compare === true);
  const [metric, setMetricState] = useState<ScoreMetric>(() => (isMetric(initialPrefs.metric) ? initialPrefs.metric : 'overview'));
  const navigate = useNavigate();

  // Every change to view, period or compare is saved. A storage that refuses (private window) just forgets.
  const remember = (next: Partial<ScorePrefs>) => {
    try {
      localStorage.setItem(`${PREFS_KEY}-${user?.id ?? 'anon'}`, JSON.stringify({ ...loadPrefs(user?.id), ...next }));
    } catch {
      /* nothing to do */
    }
  };
  const setPeriod = (next: ScorePeriod) => { setPeriodState(next); remember({ period: next }); };
  const setCompare = (next: boolean) => { setCompareState(next); remember({ compare: next }); };
  const setMetric = (next: ScoreMetric) => { setMetricState(next); remember({ metric: next }); };
  // Closed by default, so the card opens on the signed-in person's own scores. Open, it shows the measure tabs
  // and, for Admin, PC and department heads, everyone they may see, with a search box.
  const [moreOpen, setMoreOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches);
  const [everOpened, setEverOpened] = useState(moreOpen);
  // From 1024px the controls are a permanent side panel beside the chart, not a fold.
  const isWide = useMediaQuery('(min-width: 1024px)');
  const toggleMore = () => { setMoreOpen((v) => !v); setEverOpened(true); };
  const views = VIEWS;
  const activeView: ScoreView = view;
  const setView = (next: ScoreView) => { setViewState(next); remember({ view: next }); };

  const people = useAssignableUsersQuery();
  const departments = useDepartmentsQuery(scopes.includes('department') || canPickPerson);
  const stores = useStoresQuery(scope === 'store');

  const options = useMemo<ComboboxOption[]>(() => {
    if (scope === 'person') {
      const deptName = new Map((departments.data ?? []).map((d) => [d.id, d.name]));
      return (people.data ?? [])
        .map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName ?? ''}`.trim(), hint: p.departmentId ? deptName.get(p.departmentId) : undefined }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    if (scope === 'department') {
      return (departments.data ?? []).filter((d) => orgWide || d.id === user?.departmentId).map((d) => ({ value: d.id, label: d.name }));
    }
    return (stores.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  }, [scope, people.data, departments.data, stores.data, orgWide, user?.departmentId]);

  // Department and Store open on the viewer's own, so nobody starts at an empty picker. Picking
  // something else overrides it; switching view puts it back.
  const ownDefault = scope === 'department' ? user?.departmentId ?? '' : scope === 'store' ? user?.storeId ?? '' : '';
  const effectivePick = picked || ownDefault;
  const ready = scope === 'person' || !!effectivePick;
  const targetId = effectivePick || undefined;

  const range = windowFor(period, offset);
  const queryClient = useQueryClient();
  const query = useQuery<Scores>({
    ...scoreQuery(scope, targetId, range.from, range.to),
    enabled: ready,
    // Keep the last numbers on screen while the next window loads, but only for the same subject, so
    // switching person, department or store never shows one under another's name.
    placeholderData: (previous: Scores | undefined) => (previous && previous.scope === scope && (!targetId || previous.id === targetId) ? previous : undefined),
  });
  const data = ready ? query.data : undefined;
  const loading = ready && !data && query.isPending;

  // The window before this one, only fetched while Compare is on and the view can show a change.
  const previousRange = windowFor(period, offset - 1);
  const previousQuery = useQuery<Scores>({
    ...scoreQuery(scope, targetId, previousRange.from, previousRange.to),
    enabled: ready && compare && (activeView === 'bars' || activeView === 'dials'),
  });
  const previous = compare ? previousQuery.data : undefined;

  // Where the late items for a module live, for the subject on the card. A list that cannot be narrowed to
  // the subject (checklists of someone else) has no link rather than a misleading one.
  const drillHref = (module: 'checklist' | 'ticket' | 'delegation'): string | null => {
    const mine = scope === 'person' && (!targetId || targetId === user?.id);
    const id = targetId ?? user?.id ?? '';
    if (module === 'delegation') {
      if (scope === 'person') return mine ? '/tasks?quickFilter=delayed&mine=1' : `/tasks?quickFilter=delayed&assigneeIds=${id}`;
      return scope === 'department' ? `/tasks?quickFilter=delayed&departmentId=${id}` : `/tasks?quickFilter=delayed&storeId=${id}`;
    }
    if (module === 'ticket') return scope === 'person' ? `/tickets?quickFilter=delayed&assigneeIds=${id}` : '/tickets?quickFilter=delayed';
    if (mine) return '/checklists?status=overdue';
    return scope === 'store' ? `/checklists?status=overdue&store=${id}` : null;
  };
  const openModule = (module: 'checklist' | 'ticket' | 'delegation') => {
    const href = drillHref(module);
    if (href) navigate(href);
  };

  // Warm the neighbouring windows so the arrows feel instant.
  useEffect(() => {
    if (!ready) return;
    for (const o of [offset - 1, ...(offset < 0 ? [offset + 1] : [])]) {
      const w = windowFor(period, o);
      void queryClient.prefetchQuery(scoreQuery(scope, targetId, w.from, w.to));
    }
  }, [ready, period, offset, scope, targetId, queryClient]);

  const save = (rows: TableRows, format: 'csv' | 'xlsx', base: string) => {
    downloadBlob(format === 'csv' ? csvBlob(rows) : xlsxBlob(rows, 'Scores'), stampedFilename(base, format));
  };

  // What is on screen: this person, department or store, for this window.
  const exportView = (format: 'csv' | 'xlsx') => {
    if (!data) return;
    const { checklist: c, ticket: t, delegation: d } = data;
    save([
      [`Scores for ${data.name}`],
      ['View', SCOPE_LABEL[data.scope]],
      ['Window', `${range.label} (${data.from} to ${data.to})`],
      ['Generated', new Date().toLocaleString()],
      [],
      ['Module', 'Due', 'Done', 'Done on time', 'Completion %', 'Compliance %', 'Other'],
      ['Checklist', c.due, c.completed, '', c.completionPct, c.compliancePct, `${c.approved} of ${c.submitted} approved, ${c.missed} missed`],
      ['Tickets', t.due, t.closed, t.onTime, t.completionPct, t.compliancePct, `${t.late} late`],
      ['Delegations', d.due, d.done, d.onTime, d.completionPct, d.compliancePct, `${d.overdue} overdue`],
    ], format, 'scores');
  };

  // Every department and person the viewer may see, as two tables.
  const exportReport = async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      const report = await scoreApi.report({ from: range.from, to: range.to });
      save(reportRows(report, range.label), format, 'scores-report');
      toast.success(`Exported ${report.departments.length} departments and ${report.people.length} people`);
    } catch {
      toast.error('Could not build the report. Try again.');
    } finally {
      setExporting(false);
    }
  };

  const heading = scope === 'person' && !targetId ? 'Your scores' : `${data?.name ?? SCOPE_LABEL[scope]} scores`;
  const showPicker = scope === 'person' ? canPickPerson : !(scope === 'department' && isHod);

  return (
    <section className={`${DASHBOARD_CARD_CLASS} flex flex-col gap-3 sm:gap-4 p-3 sm:p-5 min-w-0`} aria-label="Scores">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="text-sm sm:text-lg font-display font-semibold sm:font-bold text-text tracking-tight truncate">{heading}</h2>
              <InfoHint label="What do these scores mean?">
                <p><strong className="text-text">Completion</strong>: how much of the work that came due was done.</p>
                <p className="mt-1.5"><strong className="text-text">Compliance</strong>: how much was done on time. For checklists, how well the checked answers were answered.</p>
                <p className="mt-1.5">Work that is not due yet is left out, so a running week or month does not look low. Good is 80% or more, Fair 50 to 79, Low under 50.</p>
              </InfoHint>
            </div>
            <p className="mt-0.5 hidden text-xs font-medium text-text-muted sm:block">Work that fell due in the window, and how much was done on time</p>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end sm:shrink-0">
            <div role="group" aria-label="Show as" className="inline-flex items-center rounded-lg border border-border p-0.5">
              {views.map((option) => {
                const Icon = VIEW_ICON[option];
                const active = activeView === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    aria-pressed={active}
                    aria-label={`${VIEW_LABEL[option]} view`}
                    title={VIEW_LABEL[option]}
                    className={`inline-flex size-8 pointer-coarse:size-10 items-center justify-center rounded-md transition-colors ${active ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-text-muted hover:text-text'}`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!data || exporting} aria-label="Export scores" className="shrink-0 pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                  <Download size={14} strokeWidth={2.5} aria-hidden="true" />
                  <span className="hidden sm:inline">{exporting ? 'Exporting' : 'Export'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel className="text-xs">This view</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => exportView('csv')} className="gap-2"><FileText size={14} />CSV (.csv)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportView('xlsx')} className="gap-2"><FileSpreadsheet size={14} />Excel (.xlsx)</DropdownMenuItem>
                {canExportReport && (
                  <>
                    <DropdownMenuLabel className="text-xs">{orgWide ? 'All departments and people' : 'My department, by person'}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => void exportReport('csv')} className="gap-2"><FileText size={14} />Report CSV (.csv)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void exportReport('xlsx')} className="gap-2"><FileSpreadsheet size={14} />Report Excel (.xlsx)</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

      </header>

      {/* Phone and tablet: steps, then the fold, then the chart, in one column. Wide screen: the chart and the steps on
          the left, the controls as a panel on the right. */}
      <div className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:gap-x-6">
      {/* The date steps stay in view: the day or week is the thing people change most. */}
      <div className="flex w-full items-center gap-1 lg:col-start-1 lg:row-start-1">
        <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${period}`} className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-hover hover:text-text">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-xs font-display font-bold text-text">{range.label}</span>
        <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label={`Next ${period}`} className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-hover hover:text-text disabled:opacity-40 disabled:hover:border-border">
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/* Everything that picks WHAT is shown (person, department or store, the day, week or month, the measure,
          and the list of everyone with its search) is folded under one row, so the card stays short and opens on
          the signed-in person's own scores. A phone starts folded; a desktop starts open. The fold is a CSS grid
          row that eases between 0fr and 1fr, so it follows the content's real height whatever loads inside it. */}
      <div className="rounded-lg border border-border/60 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <button
          type="button"
          onClick={toggleMore}
          aria-expanded={moreOpen}
          aria-controls="scores-more"
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left outline-none transition-colors hover:bg-surface-hover/40 focus-visible:ring-2 focus-visible:ring-primary-500/40 lg:pointer-events-none lg:hover:bg-transparent"
        >
          <span className="min-w-0">
            <span className="block text-xs font-display font-semibold text-text">{canExportReport ? 'Period, measure and people' : 'Period and measure'}</span>
            <span className="block truncate text-xs font-medium text-text-muted">
              {range.label} · {METRIC_LABEL[metric]} · {scope === 'person' && !targetId ? 'Me' : data?.name ?? SCOPE_LABEL[scope]}
            </span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-text-muted transition-transform duration-300 lg:hidden', moreOpen && 'rotate-180')} aria-hidden="true" />
        </button>

        <div
          id="scores-more"
          inert={!moreOpen && !isWide}
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none lg:grid-rows-[1fr] lg:opacity-100',
            moreOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            {(everOpened || isWide) && (
              <div className="flex flex-col gap-3 border-t border-border/60 p-3 sm:max-w-md lg:max-w-none">
                {scopes.length > 1 && (
                  <PeriodTabControl value={scope} options={scopes} labels={SCOPE_LABEL} onChange={(next) => { setScope(next); setPicked(''); }} fill />
                )}

                {showPicker && (
                  <Combobox
                    value={effectivePick}
                    onChange={setPicked}
                    options={options}
                    emptyOptionLabel={scope === 'person' ? 'Me' : undefined}
                    placeholder={PICK_PLACEHOLDER[scope]}
                    isLoading={scope === 'person' ? people.isPending : scope === 'department' ? departments.isPending : stores.isPending}
                    className="h-9 w-full pointer-coarse:min-h-9 text-xs sm:h-10 sm:w-72 sm:text-sm sm:pointer-coarse:min-h-11"
                  />
                )}

                <PeriodTabControl value={period} options={PERIODS} labels={PERIOD_LABEL} onChange={(next) => { setPeriod(next); setOffset(0); }} fill />

                <div className="flex w-full items-center gap-1">
                  {(activeView === 'bars' || activeView === 'dials') && (
                    <button
                      type="button"
                      onClick={() => setCompare(!compare)}
                      aria-pressed={compare}
                      title="Show the change since the previous period"
                      className={`mr-1 inline-flex h-9 pointer-coarse:h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-display font-bold transition-colors ${compare ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-border text-text-muted hover:border-border-hover hover:text-text'}`}
                    >
                      <ArrowUp className="size-3" aria-hidden="true" /><ArrowDown className="-ml-1.5 size-3" aria-hidden="true" />
                      <span className="hidden min-[420px]:inline">Compare</span>
                    </button>
                  )}
                </div>

                <PeriodTabControl value={metric} options={METRIC_OPTIONS} labels={METRIC_LABEL} onChange={setMetric} fill />

                {canExportReport && (
                  <ScoreRanking compact={isWide} metric={metric} scope={scope} from={range.from} to={range.to} onOpen={(id) => { setPicked(id); setMoreOpen(false); }} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
      {!ready ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm font-medium text-text-muted">
          Pick a {SCOPE_LABEL[scope].toLowerCase()} above to see its scores.
        </div>
      ) : activeView === 'trend' ? (
        <ScoreTrend metric={metric} scope={scope} id={targetId} period={period} from={range.from} to={range.to} />
      ) : query.isError && !data ? (
        <div className="rounded-lg border border-border px-4 py-6 text-center text-sm font-medium text-text-muted">
          Could not load the scores.{' '}
          <button type="button" onClick={() => void query.refetch()} className="font-bold text-primary-600 dark:text-primary-400 hover:underline">Try again</button>
        </div>
      ) : (
        <div className={`transition-opacity duration-200 ${query.isFetching && data ? 'opacity-60' : ''}`}>
        {activeView === 'bars' ? (
          <ScoreBars scores={data} loading={loading} metric={metric} previous={previous} onOpenModule={(m) => openModule(m)} />
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {([
            { key: 'checklist', title: 'Checklist', icon: ClipboardCheck },
            { key: 'ticket', title: 'Tickets', icon: TicketIcon },
            { key: 'delegation', title: 'Delegations', icon: Users },
          ] as { key: ModuleKey; title: string; icon: typeof Users }[]).map(({ key, title, icon }) => {
            // Overview keeps the headline score; the other tabs show that one measure for every module.
            const now = data ? numbersFor(data, key) : null;
            const before = previous ? numbersFor(previous, key) : null;
            const pick = (n: ReturnType<typeof numbersFor> | null, fallback: number | null | undefined) =>
              n === null ? null : metric === 'completion' ? n.completion : metric === 'compliance' ? n.compliance : metric === 'ontime' ? n.ontime : fallback ?? null;
            const headline = (d: typeof data) => (d ? (key === 'checklist' ? d.checklist.score : key === 'ticket' ? d.ticket.score : d.delegation.score) : null);
            const score = pick(now, headline(data));
            const priorScore = pick(before, headline(previous));
            const note = now === null ? '' : metric === 'completion' ? now.completionNote : metric === 'compliance' ? now.complianceNote : metric === 'ontime' ? now.ontimeNote : '';
            const overviewDetail = !data ? '' : key === 'checklist'
              ? `${data.checklist.completed} of ${data.checklist.due} done${data.checklist.submitted ? `, ${data.checklist.approved} of ${data.checklist.submitted} approved` : ''}`
              : key === 'ticket' ? `${data.ticket.onTime} of ${data.ticket.due} on time` : `${data.delegation.done} of ${data.delegation.due} done`;
            return (
              <ScoreTile
                key={key}
                loading={loading}
                title={title}
                icon={icon}
                score={score}
                href={drillHref(key)}
                change={score !== null && priorScore !== null ? score - priorScore : null}
                detail={metric === 'overview' ? overviewDetail : note}
              />
            );
          })}
        </div>
        )}
        </div>
      )}
      </div>
      </div>
    </section>
  );
};
