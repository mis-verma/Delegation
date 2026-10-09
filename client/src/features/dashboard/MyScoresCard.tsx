import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, SlidersHorizontal, ChartColumn, ChartLine, ChevronDown, ChevronLeft, ChevronRight, CircleGauge, ClipboardCheck, Download, FileSpreadsheet, FileText, Ticket as TicketIcon, Users, type LucideIcon } from 'lucide-react';
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
import { ScoreDrillPopup } from './ScoreDrillPopup';
import { ScoreRanking } from './ScoreRanking';
import { METRIC_LABEL, METRIC_OPTIONS, isMetric, numbersFor, seriesFor, type ModuleKey, type ScoreMetric } from './scoreMetrics';
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
  score: number | null;
  detail: string;
  loading: boolean;
  /** Tapping the tile opens the popup with the figures and the way to the finished and late items. */
  onOpen?: () => void;
  /** The score now minus the previous period's, shown when Compare is on. */
  change?: number | null;
}

// A small dial, then the number, the name and the counts under it, three across even on a phone. The dial
// is a picture only (its end labels would be about 3px at this size); everything you read is real text at
// a readable size and wraps instead of being cut off.
const ScoreTile = ({ title, score, detail, loading, onOpen, change }: ScoreTileProps) => {
  // A small count still gets its colour: one finished item out of one is a full, green score.
  const tone = score === null ? 'neutral' : rateTone(score, Number.MAX_SAFE_INTEGER);
  const [from, to] = RING[tone];
  const tileClass = `flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-border bg-surface-hover/30 p-2.5 text-center sm:p-3 ${onOpen ? 'cursor-pointer transition-colors duration-150 hover:border-border-hover active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40' : ''}`;
  const label = score === null ? `${title}: nothing due` : `${title}: ${score} percent${detail ? `, ${detail}` : ''}`;
  const body = (
    <>
      <SemiGauge
        percent={score ?? 0}
        showFill={score !== null}
        gradientFrom={from}
        gradientTo={to}
        endLabels={false}
        className="max-w-20 sm:max-w-28"
      />
      <span className="t-figure font-display font-extrabold tabular-nums text-text">{loading ? ' ' : score === null ? '–' : `${score}%`}</span>
      <span className="t-meta font-display font-semibold leading-snug text-text-secondary break-words">{title}</span>
      {!loading && score !== null && detail && <span className="t-meta font-display leading-snug text-text-muted break-words">{detail}</span>}
      {change != null && change !== 0 && (
        <span className={`inline-flex items-center t-meta font-display font-bold tabular-nums ${change > 0 ? 'text-success' : 'text-danger'}`} title="Compared with the previous period">
          {change > 0 ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}
          {Math.abs(change)}
        </span>
      )}
    </>
  );
  return onOpen
    ? <button type="button" onClick={onOpen} aria-label={`${label}. Open the details`} className={tileClass}>{body}</button>
    : <div role="group" aria-label={label} className={tileClass}>{body}</div>;
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
  // Closed by default at every size, so the card opens on the chart. (A wide card shows the controls as a side panel instead.)
  const [moreOpen, setMoreOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  // When the CARD itself is wide (not the screen: a half-width card on a big screen is still narrow) the controls are
  // a permanent side panel beside the chart. Measured with the same width the CSS container query uses.
  const cardRef = useRef<HTMLElement>(null);
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setIsWide(entry.contentRect.width >= 896));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
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
  const drillHref = (module: ModuleKey, kind: 'late' | 'completed'): string | null => {
    const mine = scope === 'person' && (!targetId || targetId === user?.id);
    const id = targetId ?? user?.id ?? '';
    const late = kind === 'late';
    const quick = late ? 'delayed' : 'completed';
    if (module === 'delegation') {
      if (scope === 'person') return mine ? `/tasks?quickFilter=${quick}&mine=1` : `/tasks?quickFilter=${quick}&assigneeIds=${id}`;
      return scope === 'department' ? `/tasks?quickFilter=${quick}&departmentId=${id}` : `/tasks?quickFilter=${quick}&storeId=${id}`;
    }
    if (module === 'ticket') return scope === 'person' ? `/tickets?quickFilter=${quick}&assigneeIds=${id}` : `/tickets?quickFilter=${quick}`;
    const status = late ? 'overdue' : 'completed';
    if (mine) return `/checklists?status=${status}`;
    return scope === 'store' ? `/checklists?status=${status}&store=${id}` : null;
  };
  // A tapped score opens a small popup first; its buttons are what leave the dashboard.
  // Kept after it closes so the popup can fade out instead of vanishing.
  const [drillState, setDrillState] = useState<{ module: ModuleKey; open: boolean } | null>(null);
  const openDrill = (module: ModuleKey) => setDrillState({ module, open: true });
  const closeDrill = () => setDrillState((d) => (d ? { ...d, open: false } : d));
  const goTo = (href: string) => {
    // Straight away, in the tap itself: a delayed navigate could be lost if the card re-rendered meanwhile. The
    // popup closes with it, and the page cross-fades where the browser supports it.
    closeDrill();
    void navigate(href, { viewTransition: true });
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
    <section ref={cardRef} className={`${DASHBOARD_CARD_CLASS} @container flex flex-col gap-3 p-3 sm:p-4 min-w-0`} aria-label="Scores">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="t-section font-display font-bold text-text tracking-tight line-clamp-2">{heading}</h2>
              <InfoHint label="What do these scores mean?">
                <p><strong className="text-text">Completion</strong>: how much of the work that came due was done.</p>
                <p className="mt-1.5"><strong className="text-text">Compliance</strong>: how much was done on time. For checklists, how well the checked answers were answered.</p>
                <p className="mt-1.5">Work that is not due yet is left out, so a running week or month does not look low. Good is 80% or more, Fair 50 to 79, Low under 50.</p>
              </InfoHint>
            </div>
            <p className="mt-0.5 hidden t-meta font-medium text-text-muted sm:block">Work that fell due in the window, and how much was done on time</p>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end sm:shrink-0">
            <div role="group" aria-label="Show as" className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-hover/40 p-1">
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
                    className={`inline-flex size-8 pointer-coarse:size-11 items-center justify-center rounded-md transition-colors ${active ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white dark:from-primary-400 dark:to-primary-600' : 'text-text-muted hover:bg-surface hover:text-text'}`}
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
      <div className="flex flex-col gap-3 @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:grid-rows-[auto_1fr] @4xl:gap-x-5">
      {/* The date steps stay in view: the day or week is the thing people change most. */}
      <div className="flex w-full items-center gap-1 rounded-xl border border-border bg-surface-hover/30 p-1 @4xl:col-start-1 @4xl:row-start-1">
        <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${period}`} className="inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-display font-semibold text-text">{range.label}</span>
        <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label={`Next ${period}`} className="inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-40 disabled:hover:bg-transparent">
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/* Everything that picks WHAT is shown (person, department or store, the day, week or month, the measure,
          and the list of everyone with its search) is folded under one row, so the card stays short and opens on
          the signed-in person's own scores. A phone starts folded; a desktop starts open. The fold is a CSS grid
          row that eases between 0fr and 1fr, so it follows the content's real height whatever loads inside it. */}
      <div className="rounded-lg border border-border/60 @4xl:col-start-2 @4xl:row-span-2 @4xl:row-start-1 @4xl:self-start">
        <button
          type="button"
          onClick={toggleMore}
          aria-expanded={moreOpen}
          aria-controls="scores-more"
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-surface-hover/40 focus-visible:ring-2 focus-visible:ring-primary-500/40 @4xl:pointer-events-none @4xl:hover:bg-transparent"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-700 ring-1 ring-primary-500/15 dark:text-primary-300 sm:size-8">
              <SlidersHorizontal className="size-3.5 sm:size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block t-meta font-display font-semibold text-text">{canExportReport ? 'Period, measure and people' : 'Period and measure'}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1">
                {[range.label, METRIC_LABEL[metric], scope === 'person' && !targetId ? 'Me' : data?.name ?? SCOPE_LABEL[scope]].map((chip) => (
                  <span key={chip} className="max-w-full truncate rounded-full bg-primary-500/10 px-2 py-0.5 t-meta font-display font-semibold text-primary-700 dark:text-primary-300">{chip}</span>
                ))}
              </span>
            </span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-text-muted transition-transform duration-300 @4xl:hidden', moreOpen && 'rotate-180')} aria-hidden="true" />
        </button>

        <div
          id="scores-more"
          inert={!moreOpen && !isWide}
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none @4xl:grid-rows-[1fr] @4xl:opacity-100',
            moreOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            {(everOpened || isWide) && (
              <div className="flex flex-col gap-2.5 border-t border-border/60 p-2.5">
                {scopes.length > 1 && (
                  <PeriodTabControl value={scope} options={scopes} labels={SCOPE_LABEL} onChange={(next) => { setScope(next); setPicked(''); }} fill dense />
                )}

                {/* The picker and Compare sit on one row. */}
                <div className="flex items-center gap-2">
                  {showPicker && (
                    <Combobox
                      value={effectivePick}
                      onChange={setPicked}
                      options={options}
                      emptyOptionLabel={scope === 'person' ? 'Me' : undefined}
                      placeholder={PICK_PLACEHOLDER[scope]}
                      isLoading={scope === 'person' ? people.isPending : scope === 'department' ? departments.isPending : stores.isPending}
                      className="h-9 min-w-0 flex-1 pointer-coarse:min-h-9 text-xs sm:text-sm"
                    />
                  )}
                  {(activeView === 'bars' || activeView === 'dials') && (
                    <button
                      type="button"
                      onClick={() => setCompare(!compare)}
                      aria-pressed={compare}
                      title="Show the change since the previous period"
                      aria-label="Compare with the previous period"
                      className={`inline-flex shrink-0 h-9 pointer-coarse:h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-display font-bold transition-colors ${compare ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-border text-text-muted hover:border-border-hover hover:text-text'}`}
                    >
                      <ArrowUp className="size-3" aria-hidden="true" /><ArrowDown className="-ml-1.5 size-3" aria-hidden="true" />
                      <span className="hidden min-[420px]:inline">Compare</span>
                    </button>
                  )}
                </div>

                <PeriodTabControl value={period} options={PERIODS} labels={PERIOD_LABEL} onChange={(next) => { setPeriod(next); setOffset(0); }} fill dense />

                <PeriodTabControl value={metric} options={METRIC_OPTIONS} labels={METRIC_LABEL} onChange={setMetric} fill dense />

                {canExportReport && (
                  <ScoreRanking compact={isWide} metric={metric} scope={scope} from={range.from} to={range.to} onOpen={(id) => { setPicked(id); setMoreOpen(false); }} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 @4xl:col-start-1 @4xl:row-start-2">
      {!ready ? (
        <div className="rounded-lg border border-border px-4 py-8 text-center text-sm font-medium text-text-muted">
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
          <ScoreBars scores={data} loading={loading} metric={metric} previous={previous} onOpenModule={openDrill} />
        ) : (
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          {([
            { key: 'checklist', title: 'Checklist', icon: ClipboardCheck },
            { key: 'ticket', title: 'Tickets', icon: TicketIcon },
            { key: 'delegation', title: 'Delegations', icon: Users },
          ] as { key: ModuleKey; title: string; icon: typeof Users }[]).map(({ key, title }) => {
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
                score={score}
                onOpen={() => openDrill(key)}
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
      {drillState && data && (
        <ScoreDrillPopup
          open={drillState.open}
          onOpenChange={(next) => { if (!next) closeDrill(); }}
          title={drillState.module === 'checklist' ? 'Checklist' : drillState.module === 'ticket' ? 'Tickets' : 'Delegations'}
          windowLabel={range.label}
          subject={scope === 'person' && (!targetId || targetId === user?.id) ? undefined : data.name}
          figures={(() => {
            const n = numbersFor(data, drillState.module);
            return (['completion', 'compliance', 'ontime'] as const)
              .filter((k) => metric === 'overview' || seriesFor(metric).includes(k))
              .map((k) => ({ key: k, value: n[k], note: n[`${k}Note` as const] }));
          })()}
          completedHref={drillHref(drillState.module, 'completed')}
          lateHref={drillHref(drillState.module, 'late')}
          onGo={goTo}
        />
      )}
    </section>
  );
};
