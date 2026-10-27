import { memo, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { scoreApi, type ScoreScope, type ScoreTrend, type TrendBucket, type Scores } from '../../api/scores';
import { CountUp } from '../../components/countUp';
import { Skeleton } from '../../components/skeleton';
import { formatPct, roundPct } from '../../lib/percent';
import { GOOD_FROM } from '../../lib/scoreBands';
import { MODULE_LABEL, SCORE_LABEL, complianceLabel } from '../../lib/scoreLabels';
import { useOrgToday } from '../checklist/useOrgToday';
import { CATEGORY_ICON, CATEGORY_TILE } from './categoryLook';
import { SCORE_QUERY_OPTIONS } from './scoreQueries';
import { moduleOverall, numbersFor, type ModuleKey, type ScoreMetric } from './scoreMetrics';
import { IconChip } from '../../components/iconChip';
import { TONE_TEXT, TONE_WORD, toneOf } from './scoreTone';
import { HeatDots } from './HeatDots';
import { ToneChip } from './ToneChip';

const MODULES: readonly ModuleKey[] = ['checklist', 'ticket', 'delegation'];
const TREND_DAYS = 7;

const valueText = (tone: ReturnType<typeof toneOf>) => (tone === 'neutral' ? 'text-text' : TONE_TEXT[tone]);

interface Cell {
  key: ModuleKey;
  hasData: boolean;
  score: number | null;
  change: number | null;
  detail: string;
}

const cellsFor = (data: Scores, previous: Scores | undefined, metric: ScoreMetric): Cell[] =>
  MODULES.map((key) => {
    const now = numbersFor(data, key);
    const before = previous ? numbersFor(previous, key) : null;
    const pick = (n: ReturnType<typeof numbersFor> | null, fallback: number | null): number | null =>
      n === null ? null : metric === 'completion' ? n.completion : metric === 'compliance' ? n.compliance : metric === 'ontime' ? n.ontime : fallback;
    const score = pick(now, moduleOverall(data, key));
    const prior = pick(before, previous ? moduleOverall(previous, key) : null);
    const note = metric === 'completion' ? now.completionNote : metric === 'compliance' ? now.complianceNote : metric === 'ontime' ? now.ontimeNote : '';
    const detail = metric === 'overview'
      ? `${SCORE_LABEL.completion} ${formatPct(now.completion)}, ${complianceLabel(key).toLowerCase()} ${formatPct(now.compliance)}`
      : note;
    return { key, hasData: now.hasData, score, change: score !== null && prior !== null ? Math.round((score - prior) * 10) / 10 : null, detail };
  });

const headlineOf = (cells: Cell[]): string | null => {
  const withData = cells.filter((c) => c.hasData && c.score !== null);
  if (withData.length === 0) return null;
  const parts: string[] = [];
  const drops = withData.filter((c) => c.change !== null && c.change < 0).sort((a, b) => (a.change as number) - (b.change as number));
  if (drops[0]) parts.push(`${MODULE_LABEL[drops[0].key]} dropped ${Math.abs(drops[0].change as number)} points.`);
  const lowest = [...withData].sort((a, b) => (a.score as number) - (b.score as number))[0];
  if (lowest && (lowest.score as number) < GOOD_FROM && (!drops[0] || drops[0].key !== lowest.key)) {
    parts.push(`Lowest: ${MODULE_LABEL[lowest.key]} at ${formatPct(lowest.score)}.`);
  }
  if (parts.length === 0) return withData.every((c) => (c.score as number) >= GOOD_FROM) ? 'Everything is on track.' : null;
  return parts.join(' ');
};

const shiftDay = (day: string, delta: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

const dotValue = (b: TrendBucket, key: ModuleKey, metric: ScoreMetric): number | null => {
  const m = b[key];
  if (m.due <= 0) return null;
  if (metric === 'completion') return m.completionPct;
  if (metric === 'compliance') return m.compliancePct;
  if (metric === 'ontime') return m.onTimePct;
  const parts = [m.completionPct, m.compliancePct].filter((v): v is number => v !== null);
  return parts.length ? parts.reduce((x, y) => x + y, 0) / parts.length : null;
};

interface OverallInput {
  value: number | null;
  change: number | null;
  label?: string;
}

interface ScoreNumbersProps {
  scores: Scores | undefined;
  previous?: Scores | undefined;
  loading: boolean;
  metric?: ScoreMetric;
  overall?: OverallInput;
  trend?: { scope: ScoreScope; id?: string };
  onOpenModule?: (key: ModuleKey) => void;
  emptyText?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
}

const ChangeText = ({ change: raw }: { change: number | null }) => {
  const change = raw === null ? null : Math.round(raw * 10) / 10;
  return change !== null && change !== 0 ? (
    <IconChip
      icon={change > 0 ? ArrowUp : ArrowDown}
      tone={change > 0 ? 'bg-success' : 'bg-danger'}
      label={`${Math.abs(change)} pts`}
      labelClassName={cn('tabular-nums', change > 0 ? 'text-success' : 'text-danger')}
      title="Compared with the last period"
    />
  ) : null;
};

export const ScoreNumbers = memo(({ scores, previous, loading, metric = 'overview', overall, trend, onOpenModule, emptyText = 'Nothing due yet', emptyHint, emptyAction }: ScoreNumbersProps) => {
  const today = useOrgToday();
  const span = useMemo(() => {
    if (!scores) return null;
    const end = scores.to < today ? scores.to : today;
    return { from: shiftDay(end, -(TREND_DAYS - 1)), to: end };
  }, [scores, today]);
  const trendQuery = useQuery<ScoreTrend>({
    queryKey: ['scores', 'trend', trend?.scope ?? 'org', trend?.id ?? 'me', 'day', span?.from ?? '', span?.to ?? ''],
    queryFn: () => scoreApi.trend({ scope: trend!.scope, id: trend?.id, period: 'day', from: span!.from, to: span!.to }),
    enabled: !!trend && !!span,
    ...SCORE_QUERY_OPTIONS,
  });

  const cols = overall ? 'sm:grid-cols-4' : 'sm:grid-cols-3';
  const gridClass = `grid grid-cols-1 divide-y divide-border/60 overflow-hidden rounded-xl border border-primary-500/20 bg-linear-to-br from-primary-500/12 via-primary-500/5 to-transparent sm:divide-x sm:divide-y-0 ${cols}`;

  if (loading && !scores) {
    return (
      <div className={gridClass} role="status" aria-label="Loading scores">
        {Array.from({ length: overall ? 4 : 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-14" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  const cells = scores ? cellsFor(scores, previous, metric) : [];
  if (cells.length > 0 && cells.every((c) => !c.hasData)) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface-hover/50 px-4 py-6 text-center">
        <p className="t-card font-display font-bold text-text">{emptyText}</p>
        {emptyHint && <p className="max-w-md t-meta font-medium text-text-muted">{emptyHint}</p>}
        {emptyAction}
      </div>
    );
  }

  const headline = headlineOf(cells);
  const buckets = trendQuery.data?.buckets ?? [];
  const overallTone = overall ? toneOf(overall.value) : 'neutral';
  const overallRounded = overall ? roundPct(overall.value) : null;

  return (
    <div className="flex flex-col gap-2">
      {headline && <p className="t-card font-display font-semibold text-text">{headline}</p>}
      <ul className={`stat-rise ${gridClass}`} aria-label="Scores by module">
        {overall && (
          <li className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2.5 sm:py-3">
            <span className="t-meta font-display font-semibold text-text-muted">{overall.label ?? SCORE_LABEL.overall}</span>
            {overallRounded === null ? (
              <span className="t-meta font-display text-text-light">Nothing due</span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn('t-figure font-display font-extrabold tabular-nums leading-none', valueText(overallTone))}>
                  <CountUp value={overallRounded} decimals={1} fromZero format={(n) => `${n}%`} />
                </span>
                <ToneChip tone={overallTone} />
                <ChangeText change={overall.change} />
              </span>
            )}
          </li>
        )}
        {cells.map((cell) => {
          const Icon = CATEGORY_ICON[cell.key];
          const tone = toneOf(cell.score);
          const rounded = roundPct(cell.score);
          const interactive = !!onOpenModule && cell.hasData;
          const label = cell.score === null ? `${MODULE_LABEL[cell.key]}: nothing due` : `${MODULE_LABEL[cell.key]}: ${formatPct(cell.score)}, ${TONE_WORD[tone]}`;
          const dots = buckets.map((b) => dotValue(b, cell.key, metric));
          const body = (
            <>
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white', CATEGORY_TILE[cell.key])} aria-hidden="true">
                <Icon className="size-[1.125rem]" strokeWidth={2.25} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="t-card font-display font-bold text-text">{MODULE_LABEL[cell.key]}</span>
                {cell.hasData && rounded !== null ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn('t-stat font-display font-extrabold tabular-nums leading-none', valueText(tone))}>{formatPct(rounded)}</span>
                    <ToneChip tone={tone} />
                    <ChangeText change={cell.change} />
                  </span>
                ) : (
                  <span className="t-meta font-display text-text-light">Nothing due</span>
                )}
                {cell.hasData && dots.length > 0 && <HeatDots values={dots} labels={buckets.map((x) => x.label)} />}
                {cell.hasData && cell.detail && <span className="hidden t-meta text-text-muted sm:block">{cell.detail}</span>}
              </span>
              {interactive && <ChevronRight className="size-4 shrink-0 text-text-light" aria-hidden="true" />}
            </>
          );
          const cls = 'flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left sm:py-3';
          return (
            <li key={cell.key}>
              {interactive ? (
                <button
                  type="button"
                  onClick={() => onOpenModule?.(cell.key)}
                  aria-label={`${label}. Open the details`}
                  className={`${cls} cursor-pointer outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 active:bg-surface-hover`}
                >
                  {body}
                </button>
              ) : (
                <div className={cls} aria-label={label}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
});
ScoreNumbers.displayName = 'ScoreNumbers';
