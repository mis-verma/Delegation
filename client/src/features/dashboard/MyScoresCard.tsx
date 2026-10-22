import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, CalendarDays, Trophy, SlidersHorizontal, ChartColumn, ChartLine, ChevronDown, ChevronLeft, ChevronRight, CircleGauge, type LucideIcon } from 'lucide-react';
import { Button, Combobox, CountUp, ExportMenu, IconChip, Switch, type ComboboxOption, type ExportSource, type ExportTable } from '../../components';
import { rateWord } from '../checklist/checklistDisplay';
import { SemiGauge } from '../../components/semiGauge/SemiGauge';
import { InlineError } from '../../components/inlineError';
import { useAuth } from '../../context/AuthContext';
import { scoreApi, type ScoreReport, type ScoreReportRow, type ScoreScope, type ScoreTrend as ScoreTrendData } from '../../api/scores';
import { exportTitle, formatExportDate, type TableRows } from '../../lib/exportTable';
import { useAssignableUsersQuery, useDepartmentsQuery, useStoresQuery } from '../tickets/hook';
import { PeriodTabControl } from './PeriodTabControl';
import { useOrgToday } from '../checklist/useOrgToday';
import { useIsMobile } from '../../lib/useMediaQuery';
import { ScoreBars } from './ScoreBars';
import { ScoreHero } from './ScoreHero';
import { ToneChip } from './ToneChip';
import { TONE_BAR } from './scoreTone';
import { CATEGORY_ICON, CATEGORY_TILE } from './categoryLook';
import { heroFacts } from './heroFacts';
import { SimpleScoresView } from './SimpleScoresView';
import { ScoreDrillPopup } from './ScoreDrillPopup';
import { ScoreRanking } from './ScoreRanking';
import { scoreQuery } from './scoreQueries';
import { explorerParamsFor, useScopeScores } from '../scores/useExplorerScores';
import { scoreExplorerQuery } from '../scores/useScoreExplorer';
import { capWindowAtToday } from '../scores/useScoreWindow';
import { METRIC_LABEL, METRIC_OPTIONS, MODULE_EXPORT_HEAD, MODULE_ROWS, acrossModules, isMetric, moduleExportCells, moduleOverall, numbersFor, overallOf, seriesFor, type ModuleKey, type ScoreMetric } from './scoreMetrics';
import { orgDayWindow } from './scoreDrill';
import { ScoreTrend } from './ScoreTrend';
import { DASHBOARD_CARD_CLASS, rateTone, type RateTone } from './dashboardDisplay';
import { PERIODS, PERIOD_LABEL, windowFor, type ScorePeriod } from './scorePeriods';
import { formatPct, roundPct } from '../../lib/percent';
import { MODULE_LABEL, SCORE_LABEL, complianceLabel } from '../../lib/scoreLabels';
import { HintPopover, HowCalculated } from '../scores/HowCalculated';
import { dashboardViewFor } from './dashboardView';
import { FIELD_LABEL_CLASS } from '../scores/controlStyles';

const SCOPE_LABEL: Record<ScoreScope, string> = { org: 'Company', person: 'Person', department: 'Department', store: 'Store' };
type ScoreView = 'bars' | 'dials' | 'trend';
const VIEWS: readonly ScoreView[] = ['bars', 'dials', 'trend'];
const VIEW_LABEL: Record<ScoreView, string> = { bars: 'Bars', dials: 'Dials', trend: 'Trend' };
const VIEW_ICON: Record<ScoreView, LucideIcon> = { bars: ChartColumn, dials: CircleGauge, trend: ChartLine };

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
const PICK_PLACEHOLDER: Record<ScoreScope, string> = { org: '', person: 'Me', department: 'Pick a department', store: 'Pick a store' };

const RING: Record<RateTone, [string, string]> = {
  success: ['var(--color-success)', 'var(--color-success)'],
  warning: ['var(--color-warning)', 'var(--color-warning)'],
  danger: ['var(--color-danger)', 'var(--color-danger)'],
  neutral: ['var(--color-primary-400)', 'var(--color-primary-700)'],
};

const EXPORT_LEGEND: TableRows = [[], ['Notes'], ['Colours: green is Good (80% or more), amber is Fair (50 to 79), red is Low (under 50).']];

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

const reportRows = (report: ScoreReport): TableRows => [
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
  module: ModuleKey;
  title: string;
  score: number | null;
  detail: string;
  loading: boolean;
  onOpen: () => void;
  change?: number | null;
  index: number;
}

const ScoreTile = ({ module, title, score, detail, loading, onOpen, change, index }: ScoreTileProps) => {
  const tone = score === null ? 'neutral' : rateTone(score, Number.MAX_SAFE_INTEGER);
  const [from, to] = RING[tone];
  const Icon = CATEGORY_ICON[module];
  const rounded = roundPct(score);
  const tileClass = 'stat-rise relative flex min-w-0 cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-xl border border-border bg-surface p-3 pt-3.5 text-center transition-colors duration-150 hover:border-border-hover active:scale-[0.985] outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';
  const label = score === null ? `${title}: nothing due` : `${title}: ${formatPct(score)}, ${rateWord(score)}${detail ? `, ${detail}` : ''}`;
  return (
    <button type="button" onClick={onOpen} aria-label={`${label}. Open the details`} style={{ '--stat-delay': `${index * 70}ms` } as CSSProperties} className={tileClass}>
      <span className={cn('absolute inset-x-0 top-0 h-1', TONE_BAR[tone])} aria-hidden="true" />
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-white', CATEGORY_TILE[module])} aria-hidden="true">
          <Icon className="size-4" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1 text-left t-card font-display font-bold leading-snug text-text break-words">{title}</span>
      </span>
      <SemiGauge
        percent={score ?? 0}
        showFill={score !== null}
        gradientFrom={from}
        gradientTo={to}
        endLabels={false}
        className="max-w-28 sm:max-w-32"
      />
      <span className="t-stat font-display font-extrabold tabular-nums leading-none text-text">
        {loading ? ' ' : rounded === null ? '-' : <CountUp value={rounded} decimals={1} fromZero format={(n) => `${n}%`} />}
      </span>
      {!loading && score !== null && <ToneChip tone={tone} />}
      {!loading && score === null && <span className="t-meta font-display text-text-light">Nothing due</span>}
      {!loading && score !== null && detail && <span className="t-meta font-display leading-snug text-text-muted break-words">{detail}</span>}
      {change != null && change !== 0 && (
        <IconChip
          icon={change > 0 ? ArrowUp : ArrowDown}
          tone={change > 0 ? 'bg-success' : 'bg-danger'}
          label={`${Math.abs(change)} pts`}
          labelClassName={cn('tabular-nums', change > 0 ? 'text-success' : 'text-danger')}
          title="Compared with the last period"
        />
      )}
    </button>
  );
};

const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const periodForSpan = (days: number): ScorePeriod => (days <= 1 ? 'day' : days <= 7 ? 'week' : days <= 31 ? 'month' : days <= 92 ? 'quarter' : 'year');

const SIMPLE_PERIODS: readonly ScorePeriod[] = ['week', 'month'];

const PanelRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <span className={FIELD_LABEL_CLASS}>{label}</span>
    {children}
  </div>
);

export const MyScoresCard = ({ initialScope = 'person', window: pageWindow, moreHref, hideRanking = false }: {
  initialScope?: ScoreScope;
  window?: { from: string; to: string; label: string };
  moreHref?: string;
  hideRanking?: boolean;
} = {}) => {
  const { user } = useAuth();
  const role = user?.role;
  const { orgWide, isHod, scores: scoreRules } = dashboardViewFor(role);
  const simple = scoreRules.simple;
  const scopes = useMemo<ScoreScope[]>(
    () => (orgWide ? ['org', 'person', 'department', 'store'] : isHod ? ['person', 'department'] : ['person']),
    [orgWide, isHod],
  );
  const canPickPerson = scoreRules.canPickPeople;
  const canExportReport = orgWide || isHod;
  const canExport = scoreRules.canExport;

  const [scope, setScope] = useState<ScoreScope>(() => (initialScope === 'org' && !orgWide ? 'person' : initialScope));
  const prefsId = `${user?.id ?? 'anon'}${initialScope === 'org' ? '-admin' : ''}`;
  const initialPrefs = useMemo(() => loadPrefs(prefsId), [prefsId]);
  const [period, setPeriodState] = useState<ScorePeriod>(() => (isPeriod(initialPrefs.period) ? initialPrefs.period : 'month'));
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState('');
  const [view, setViewState] = useState<ScoreView>(() => (isView(initialPrefs.view) ? initialPrefs.view : 'bars'));
  const [compare, setCompareState] = useState<boolean>(() => initialPrefs.compare === true);
  const [metricChoice, setMetricState] = useState<ScoreMetric>(() => (isMetric(initialPrefs.metric) ? initialPrefs.metric : 'overview'));
  const isPhone = useIsMobile();
  const glance = isPhone && !pageWindow && !simple;
  const metric: ScoreMetric = simple || glance ? 'overview' : metricChoice;
  const navigate = useNavigate();

  const remember = (next: Partial<ScorePrefs>) => {
    try {
      localStorage.setItem(`${PREFS_KEY}-${prefsId}`, JSON.stringify({ ...loadPrefs(prefsId), ...next }));
    } catch {
    }
  };
  const setPeriod = (next: ScorePeriod) => { setPeriodState(next); remember({ period: next }); };
  const setCompare = (next: boolean) => { setCompareState(next); remember({ compare: next }); };
  const setMetric = (next: ScoreMetric) => { setMetricState(next); remember({ metric: next }); };
  const [moreOpen, setMoreOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
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
  const openRanked = (id: string) => { if (scope === 'org') setScope('department'); setPicked(id); setMoreOpen(false); };
  const activeView: ScoreView = glance || simple ? 'bars' : view;
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

  const ownDefault = scope === 'department' ? user?.departmentId ?? '' : scope === 'store' ? user?.storeId ?? '' : '';
  const effectivePick = picked || ownDefault;
  const ready = scope === 'person' || scope === 'org' || !!effectivePick;
  const targetId = effectivePick || undefined;

  const shownPeriod: ScorePeriod = glance ? 'month' : simple && period !== 'week' ? 'month' : period;
  const orgToday = useOrgToday();
  const range = pageWindow ?? windowFor(shownPeriod, glance ? 0 : offset, orgToday);
  const trendPeriod: ScorePeriod = pageWindow ? periodForSpan(spanDays(pageWindow.from, pageWindow.to)) : period;
  const queryClient = useQueryClient();
  const asked = capWindowAtToday(range.from, range.to, orgToday);
  const query = useScopeScores({ scope, id: targetId, from: asked.from, to: asked.to, enabled: ready });
  const data = ready ? query.data : undefined;
  const loading = ready && !data && query.isPending;

  const previousRange = pageWindow
    ? { from: shiftDay(pageWindow.from, -spanDays(pageWindow.from, pageWindow.to)), to: shiftDay(pageWindow.from, -1) }
    : windowFor(shownPeriod, (glance ? 0 : offset) - 1, orgToday);
  const previousAsked = capWindowAtToday(previousRange.from, previousRange.to, orgToday);
  const previousQuery = useScopeScores({
    scope,
    id: targetId,
    from: previousAsked.from,
    to: previousAsked.to,
    enabled: ready && activeView !== 'trend',
  });
  const previous = compare && !simple && !glance ? previousQuery.data : undefined;

  const heroNow = heroFacts(data).overall;
  const heroBefore = heroFacts(previousQuery.data).overall;
  const heroChange = heroNow !== null && heroBefore !== null ? heroNow - heroBefore : null;
  const heroEmpty = !!data && (['checklist', 'ticket', 'delegation'] as const).every((k) => !numbersFor(data, k).hasData);

  const drillHref = (module: ModuleKey, kind: 'late' | 'completed'): string | null => {
    const mine = scope === 'person' && (!targetId || targetId === user?.id);
    const id = targetId ?? user?.id ?? '';
    const late = kind === 'late';
    const quick = late ? 'delayed' : 'completed';
    const due = orgDayWindow(range.from, range.to);
    const win = `&dueFrom=${encodeURIComponent(due.start)}&dueTo=${encodeURIComponent(due.end)}`;
    if (scope === 'org') {
      if (module === 'checklist') return late ? '/team/fill/compliance' : pageWindow ? '/admin/checklist-weekly' : `/admin/checklist-weekly?period=${shownPeriod}&offset=${glance ? 0 : offset}`;
      return module === 'ticket' ? `/tickets?quickFilter=${quick}${win}` : `/tasks?quickFilter=${quick}&category=delegation${win}`;
    }
    if (module === 'delegation') {
      if (scope === 'person') return mine ? `/tasks?quickFilter=${quick}&mine=1${win}` : `/tasks?quickFilter=${quick}&assigneeIds=${id}${win}`;
      return scope === 'department' ? `/tasks?quickFilter=${quick}&departmentId=${id}${win}` : `/tasks?quickFilter=${quick}&storeId=${id}${win}`;
    }
    if (module === 'ticket') return scope === 'person' ? `/tickets?quickFilter=${quick}&assigneeIds=${id}${win}` : scope === 'department' ? `/tickets?quickFilter=${quick}&departmentId=${id}${win}` : `/tickets?quickFilter=${quick}&storeId=${id}${win}`;
    const status = late ? 'overdue' : 'completed';
    if (mine) return `/checklists?status=${status}`;
    return scope === 'store' ? `/checklists?status=${status}&store=${id}` : null;
  };
  const [drillState, setDrillState] = useState<{ module: ModuleKey; open: boolean } | null>(null);
  const openDrill = (module: ModuleKey) => setDrillState({ module, open: true });
  const closeDrill = () => setDrillState((d) => (d ? { ...d, open: false } : d));
  const goTo = (href: string) => {
    closeDrill();
    void navigate(href, { viewTransition: true });
  };

  useEffect(() => {
    if (!ready || pageWindow || glance) return;
    for (const o of [offset - 1, ...(offset < 0 ? [offset + 1] : [])]) {
      const raw = windowFor(period, o, orgToday);
      const w = capWindowAtToday(raw.from, raw.to, orgToday);
      const explorerParams = explorerParamsFor(role, scope, w.from, w.to);
      if (explorerParams) void queryClient.prefetchQuery(scoreExplorerQuery(explorerParams));
      else void queryClient.prefetchQuery(scoreQuery(scope, targetId, w.from, w.to));
    }
  }, [ready, pageWindow, glance, period, offset, scope, targetId, queryClient, orgToday, role]);

  const exportView = async (): Promise<ExportTable> => {
    if (activeView === 'trend') {
      const trend = await queryClient.fetchQuery<ScoreTrendData>({
        queryKey: ['scores', 'trend', scope, targetId ?? 'me', trendPeriod, range.from, range.to],
        queryFn: () => scoreApi.trend({ scope, id: targetId, period: trendPeriod, from: range.from, to: range.to }),
        staleTime: 60_000,
      });
      return {
        rows: [
          ['Period', 'From', 'To', 'Module', ...MODULE_EXPORT_HEAD],
          ...trend.buckets.flatMap((b) => MODULE_ROWS.map((m) => [b.label, formatExportDate(b.from), formatExportDate(b.to), m.label, ...moduleExportCells(b, m.key)])),
          ...EXPORT_LEGEND,
        ],
        count: trend.buckets.length * MODULE_ROWS.length,
      };
    }
    if (!data) return [];
    const all = acrossModules(data);
    return {
      rows: [
        ['Module', ...MODULE_EXPORT_HEAD],
        ...MODULE_ROWS.map((m) => [m.label, ...moduleExportCells(data, m.key)]),
        ['All together', overallOf(data), all.completion, all.compliance, all.ontime, all.due, all.done, all.late, all.notDone],
        ...EXPORT_LEGEND,
      ],
      count: MODULE_ROWS.length,
    };
  };
  const exportSubject = data?.name ?? SCOPE_LABEL[scope];
  const exportFilters = { View: scope === 'org' ? null : SCOPE_LABEL[scope], Showing: activeView === 'trend' ? 'Trend' : null };

  const reportExport: ExportSource[] = canExportReport
    ? [{
        label: orgWide ? 'All departments and people' : 'My department, by person',
        filename: 'scores-report',
        sheetName: 'Scores',
        title: exportTitle({ what: orgWide ? 'Scores, all departments and people' : 'Scores, my department by person', from: range.from, to: range.to, period: range.label }),
        getRows: async () => {
          const report = await scoreApi.report({ from: range.from, to: range.to });
          return { rows: reportRows(report), count: report.departments.length + report.people.length };
        },
      }]
    : [];
  const exportMenu = (
    <ExportMenu
      disabled={!ready || (activeView !== 'trend' && !data)}
      aria-label="Export scores"
      label="This view"
      filename={scope === 'person' && !targetId ? 'my-scores' : 'scores'}
      sheetName="Scores"
      title={exportTitle({ what: `Scores, ${exportSubject}`, from: range.from, to: range.to, period: range.label, filters: exportFilters })}
      getRows={exportView}
      more={reportExport}
    />
  );

  const simpleWindow = offset === 0 ? (shownPeriod === 'week' ? 'this week' : 'this month') : `for ${range.label}`;
  const heading = simple ? `Your scores ${simpleWindow}` : scope === 'person' && !targetId ? 'Your scores' : `${data?.name ?? SCOPE_LABEL[scope]} scores`;
  const showPicker = scope === 'org' ? false : scope === 'person' ? canPickPerson : !(scope === 'department' && isHod);

  const drillPopup = drillState && data ? (
      <ScoreDrillPopup
        open={drillState.open}
        onOpenChange={(next) => { if (!next) closeDrill(); }}
        title={MODULE_LABEL[drillState.module]}
        module={drillState.module}
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
  ) : null;

  if (simple && !pageWindow) {
    return (
      <>
        <SimpleScoresView
          heading={heading}
          rangeLabel={range.label}
          period={shownPeriod}
          onPeriodChange={(next) => { setPeriod(next); setOffset(0); }}
          offset={offset}
          onStep={(d) => setOffset((o) => (d < 0 ? o - 1 : Math.min(0, o + 1)))}
          data={data}
          previous={previousQuery.data}
          loading={loading}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          isUpdating={query.isPlaceholderData}
          emptyText={`Nothing was due ${simpleWindow}`}
          onOpenModule={openDrill}
        />
        {drillPopup}
      </>
    );
  }

  return (
    <section ref={cardRef} className={`${DASHBOARD_CARD_CLASS} @container flex min-w-0 flex-col gap-4 p-4`} aria-label="Scores">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex min-w-0 items-start justify-between gap-2 sm:flex-1">
            <div className="flex min-w-0 items-start gap-3">
            <span className="hidden sm:flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-600 text-white"><Trophy className="size-5" strokeWidth={2.25} aria-hidden="true" /></span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <h2 className="t-section font-display font-bold text-text tracking-tight line-clamp-2">{heading}</h2>
                {simple ? (
                  <HowCalculated figure="overall" label="How are my scores calculated" />
                ) : (
                  <HintPopover label="What do these scores mean?">
                    <p><strong className="text-text">{SCORE_LABEL.completion}</strong>: how much of the work that came due was done.</p>
                    <p><strong className="text-text">{complianceLabel('checklist')}</strong> (checklists): how many checked answers were right. <strong className="text-text">{complianceLabel('ticket')}</strong> (tickets and delegations): how much was finished or handed in by its deadline.</p>
                    <p><strong className="text-text">{SCORE_LABEL.overall}</strong>: completion and the second measure counted equally.</p>
                    <p>Work that is not due yet is left out, so a running week or month does not look low. Good is 80% or more, Fair 50 to 79, Low under 50.</p>
                  </HintPopover>
                )}
              </div>
              {glance && <p className="t-meta font-medium text-text-muted">{range.label}</p>}
              <p className="hidden t-meta font-medium text-text-muted sm:block">What came due, how much got done, and how much was done right or on time</p>
            </div>
            </div>
          {glance && canExport && exportMenu}
          </div>
          {!simple && !glance && <div className="flex items-center justify-between gap-2 sm:justify-end sm:shrink-0">
            {moreHref && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void navigate(moreHref, { viewTransition: true })}>
                All scores
                <ChevronRight size={14} aria-hidden="true" />
              </Button>
            )}
            <div role="group" aria-label="Show as" className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-hover/40 p-1">
              {VIEWS.map((option) => {
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
                    className={`inline-flex size-8 pointer-coarse:size-11 items-center justify-center rounded-md transition-colors ${active ? 'bg-primary-600 text-white dark:bg-primary-500' : 'text-text-muted hover:bg-surface hover:text-text'}`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            {canExport && exportMenu}
          </div>}
        </div>

      </header>
      <div className={simple ? 'flex flex-col gap-3' : 'flex flex-col gap-3 @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:grid-rows-[auto_1fr_auto] @4xl:gap-x-5 @4xl:gap-y-3'}>
      {glance ? null : pageWindow ? (
        <div className="flex min-h-11 w-full flex-wrap items-center justify-center gap-x-2 rounded-lg border border-border px-3 py-2 @4xl:col-start-1 @4xl:row-start-1">
          <span className="t-card font-display font-semibold text-text">{range.label}</span>
          <span className="shrink-0 t-meta text-text-muted">from the period above</span>
        </div>
      ) : (
      <div className="flex w-full items-center gap-1 rounded-xl border border-border bg-surface-hover/40 p-1 @4xl:col-start-1 @4xl:row-start-1">
        <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${period}`} className="inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 text-center t-card font-display font-bold text-text">
          <CalendarDays className="size-4 shrink-0 text-primary-600 dark:text-primary-300" aria-hidden="true" />
          {activeView === 'trend' && period === 'day' ? (offset === 0 ? 'Last 7 days' : `7 days to ${range.label}`) : range.label}
        </span>
        <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label={`Next ${period}`} className="inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-40 disabled:hover:bg-transparent">
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      )}

      {simple && !glance && (
        <PeriodTabControl value={period === 'week' ? 'week' : 'month'} options={SIMPLE_PERIODS} labels={PERIOD_LABEL} onChange={(next) => { setPeriod(next); setOffset(0); }} fill />
      )}

      {!simple && !glance && (<>
      <div className="rounded-lg border border-border/60 @4xl:col-start-2 @4xl:row-span-2 @4xl:row-start-1 @4xl:self-start">
        <button
          type="button"
          onClick={toggleMore}
          aria-expanded={moreOpen}
          aria-controls="scores-more"
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-surface-hover/40 focus-visible:ring-2 focus-visible:ring-primary-500/40 @4xl:pointer-events-none @4xl:hover:bg-transparent"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-secondary">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="block t-meta font-display font-semibold text-text">{canExportReport ? 'Period, measure and people' : 'Period and measure'}</span>
              <span className="flex flex-wrap items-center gap-1 @4xl:hidden">
                {[range.label, metric === 'overview' ? 'Overall score' : METRIC_LABEL[metric], scope === 'person' && !targetId ? 'Me' : data?.name ?? SCOPE_LABEL[scope]].map((chip) => (
                  <span key={chip} className="max-w-full break-words rounded-full border border-border bg-surface-hover px-2 py-0.5 t-meta font-display font-semibold text-text-secondary">{chip}</span>
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
              <div className="flex flex-col gap-3 border-t border-border/60 p-3">
                {scopes.length > 1 && (
                  <PanelRow label="Show">
                    <PeriodTabControl value={scope} options={scopes} labels={SCOPE_LABEL} onChange={(next) => { setScope(next); setPicked(''); }} columns />
                  </PanelRow>
                )}

                {showPicker && (
                  <PanelRow label={scope === 'person' ? 'Person' : scope === 'department' ? 'Department' : 'Store'}>
                    <Combobox
                      value={effectivePick}
                      onChange={setPicked}
                      options={options}
                      emptyOptionLabel={scope === 'person' ? 'Me' : undefined}
                      placeholder={PICK_PLACEHOLDER[scope]}
                      isLoading={scope === 'person' ? people.isPending : scope === 'department' ? departments.isPending : stores.isPending}
                      className="h-11 w-full text-base sm:h-9 sm:text-sm"
                    />
                  </PanelRow>
                )}

                {!pageWindow && (
                  <PanelRow label="Period">
                    <PeriodTabControl value={period} options={PERIODS} labels={PERIOD_LABEL} onChange={(next) => { setPeriod(next); setOffset(0); }} columns />
                  </PanelRow>
                )}

                <PanelRow label="Measure">
                  <PeriodTabControl value={metric} options={METRIC_OPTIONS} labels={METRIC_LABEL} onChange={setMetric} columns />
                </PanelRow>

                {(activeView === 'bars' || activeView === 'dials') && (
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                    <span className="min-w-0">
                      <span className="block t-meta font-display font-semibold text-text">Compare with last period</span>
                      <span className="block t-meta text-text-muted">Shows the change under the chart</span>
                    </span>
                    <Switch checked={compare} onChange={setCompare} />
                  </label>
                )}

                {canExportReport && !isWide && (
                  <ScoreRanking metric={metric} scope={scope} from={range.from} to={range.to} onOpen={openRanked} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      </>)}

      <div className="min-w-0 @4xl:col-start-1 @4xl:row-start-2">
      {!ready ? (
        <div className="rounded-lg border border-border px-4 py-8 text-center t-card font-medium text-text-muted">
          Pick a {SCOPE_LABEL[scope].toLowerCase()} above to see its scores.
        </div>
      ) : activeView === 'trend' ? (
        <ScoreTrend metric={metric} scope={scope} id={targetId} period={trendPeriod} from={range.from} to={range.to} />
      ) : query.isError && !data ? (
        <InlineError message="Couldn't load the scores." onRetry={() => void query.refetch()} />
      ) : (
        <div className="flex flex-col gap-2">
        {query.isPlaceholderData && (
          <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These figures are for the previous period until {range.label} loads.</p>
        )}
        {metric === 'overview' && (loading || (!!data && !heroEmpty)) && (
          <ScoreHero
            facts={heroFacts(data)}
            loading={loading}
            changePts={heroChange}
          />
        )}
        {activeView === 'bars' ? (
          <ScoreBars
            scores={data}
            loading={loading}
            metric={metric}
            previous={previous}
            onOpenModule={openDrill}
            emptyText={glance ? 'Nothing due yet this month' : simple ? `Nothing was due ${simpleWindow}` : 'Nothing was due in this window'}
          />
        ) : (
        <div className="grid grid-cols-2 min-[380px]:grid-cols-3 gap-2 sm:gap-3">
          {([
            { key: 'checklist', title: MODULE_LABEL.checklist },
            { key: 'ticket', title: MODULE_LABEL.ticket },
            { key: 'delegation', title: MODULE_LABEL.delegation },
          ] as { key: ModuleKey; title: string }[]).map(({ key, title }, index) => {
            const now = data ? numbersFor(data, key) : null;
            const before = previous ? numbersFor(previous, key) : null;
            const pick = (n: ReturnType<typeof numbersFor> | null, fallback: number | null | undefined) =>
              n === null ? null : metric === 'completion' ? n.completion : metric === 'compliance' ? n.compliance : metric === 'ontime' ? n.ontime : fallback ?? null;
            const headline = (d: typeof data) => (d ? moduleOverall(d, key) : null);
            const score = pick(now, headline(data));
            const priorScore = pick(before, headline(previous));
            const note = now === null ? '' : metric === 'completion' ? now.completionNote : metric === 'compliance' ? now.complianceNote : metric === 'ontime' ? now.ontimeNote : '';
            const overviewDetail = !now ? '' : `${SCORE_LABEL.completion} ${formatPct(now.completion)}, ${complianceLabel(key).toLowerCase()} ${formatPct(now.compliance)}`;
            return (
              <ScoreTile
                key={key}
                module={key}
                index={index}
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

      {canExportReport && isWide && !hideRanking && (
        <section aria-label="Ranking" className="flex flex-col gap-2 border-t border-border/60 pt-4 @4xl:col-span-2 @4xl:row-start-3">
          <h3 className="t-card font-display font-bold text-text">Ranking</h3>
          <ScoreRanking metric={metric} scope={scope} from={range.from} to={range.to} onOpen={openRanked} />
        </section>
      )}
      </div>
      {drillPopup}
    </section>
  );
};
