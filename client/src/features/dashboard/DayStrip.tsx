import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gauge, TrendingDown, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { scoreApi, type ScoreScope, type ScoreTrend, type TrendBucket, type TrendPeriod } from '../../api/scores';
import { Skeleton } from '../../components/skeleton';
import { IconChip } from '../../components/iconChip';
import { LegendChip } from '../../components/legendChip';
import { InlineError } from '../../components/inlineError';
import { bandWord, FAIR_FROM, GOOD_FROM } from '../../lib/scoreBands';
import { formatPct, roundPct } from '../../lib/percent';
import { SCORE_QUERY_OPTIONS } from './scoreQueries';
import { TONE_COLOR } from './scoreTone';

const MODULE_KEYS = ['checklist', 'ticket', 'delegation'] as const;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const PANEL = 'flex flex-col gap-3 rounded-xl border border-vivid-blue/25 bg-linear-to-br from-vivid-blue/10 via-vivid-blue/5 to-transparent p-3 sm:p-4';

const bucketScore = (b: TrendBucket): number | null => {
  if (typeof b.overall === 'number') return b.overall;
  const parts: number[] = [];
  for (const key of MODULE_KEYS) {
    const m = b[key];
    if (m.due <= 0) continue;
    const values = [m.completionPct, m.compliancePct].filter((v): v is number => v !== null);
    if (values.length) parts.push(values.reduce((x, y) => x + y, 0) / values.length);
  }
  return parts.length ? parts.reduce((x, y) => x + y, 0) / parts.length : null;
};

const tileTone = (v: number | null) =>
  v === null
    ? 'border-border/60 bg-surface/70 text-text-muted'
    : v >= GOOD_FROM
      ? 'border-vivid-green bg-vivid-green text-on-vivid'
      : v >= FAIR_FROM
        ? 'border-vivid-sky bg-vivid-sky text-on-vivid'
        : 'border-vivid-red bg-vivid-red text-white dark:text-on-vivid';

const dateParts = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return { date: d.getUTCDate(), weekday: (d.getUTCDay() + 6) % 7 };
};

interface Cell {
  bucket: TrendBucket;
  score: number | null;
}

type TileMode = 'row' | 'calendar' | 'bucket';

const TILE_SIZE: Record<TileMode, string> = {
  row: 'h-[4.5rem] flex-1 basis-0 gap-0.5 rounded-xl py-2 sm:h-20',
  calendar: 'h-11 rounded-lg sm:h-12',
  bucket: 'min-h-14 min-w-16 flex-1 rounded-lg px-2 py-1.5',
};

const Tile = ({ cell, mode }: { cell: Cell; mode: TileMode }) => {
  const { bucket, score } = cell;
  const parts = dateParts(bucket.from);
  const text = score === null ? 'nothing due' : `${formatPct(score)}, ${bandWord(score)}`;
  const label = mode === 'bucket' ? bucket.label : String(parts.date);
  return (
    <span
      role="listitem"
      title={`${bucket.label}: ${text}`}
      aria-label={`${bucket.label}: ${text}`}
      className={cn('flex min-w-0 flex-col items-center justify-center border tabular-nums', TILE_SIZE[mode], tileTone(score))}
    >
      {mode === 'row' && <span className="t-meta font-display font-semibold leading-none opacity-80">{WEEKDAYS[parts.weekday]}</span>}
      <span className="t-card font-display font-bold leading-none">{label}</span>
      {score !== null && <span className="t-meta font-display font-semibold leading-none opacity-90">{Math.round(score)}%</span>}
    </span>
  );
};

interface DayStripProps {
  scope: ScoreScope;
  id: string | undefined;
  period: TrendPeriod;
  from: string;
  to: string;
}

export const DayStrip = ({ scope, id, period, from, to }: DayStripProps) => {
  const { data, isPending, isError, refetch } = useQuery<ScoreTrend>({
    queryKey: ['scores', 'trend', scope, id ?? 'me', period, from, to],
    queryFn: () => scoreApi.trend({ scope, id, period, from, to }),
    ...SCORE_QUERY_OPTIONS,
  });
  const cells = useMemo<Cell[]>(() => (data?.buckets ?? []).map((b) => ({ bucket: b, score: bucketScore(b) })), [data]);
  const scored = cells.filter((c): c is { bucket: TrendBucket; score: number } => c.score !== null);
  const average = scored.length ? roundPct(scored.reduce((t, c) => t + c.score, 0) / scored.length) : null;
  const best = scored.length ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const worst = scored.length > 1 ? scored.reduce((a, b) => (b.score < a.score ? b : a)) : null;
  const unit = period === 'day' ? 'day' : period === 'week' ? 'week' : 'period';
  const asDays = period === 'day' && cells.length > 0;
  const asRow = asDays && cells.length <= 7;
  const asCalendar = asDays && !asRow;
  const lead = asCalendar ? dateParts(cells[0].bucket.from).weekday : 0;
  const spread = scored.length > 1 && !!best && !!worst && best.score !== worst.score;

  if (isPending) {
    return (
      <div className={PANEL} role="status" aria-label="Loading the days">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 14 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
        </div>
      </div>
    );
  }
  if (isError && !data) return <InlineError message="Couldn't load the days." onRetry={() => void refetch()} />;
  if (cells.length === 0 || scored.length === 0) {
    return (
      <div className={PANEL}>
        <p className="t-card font-display font-semibold text-text">Nothing came due in this window</p>
        <p className="t-meta text-text-muted">Days are coloured once something comes due.</p>
      </div>
    );
  }

  return (
    <div className={PANEL}>
      <div className="flex flex-wrap items-center gap-1.5">
        {average !== null && <IconChip icon={Gauge} tone="bg-vivid-blue" label={`Average ${formatPct(average)}`} labelClassName="tabular-nums" />}
        {spread && best && <IconChip icon={Trophy} tone="bg-vivid-green" label={`Best ${unit}: ${best.bucket.label} ${formatPct(best.score)}`} labelClassName="tabular-nums" />}
        {spread && worst && <IconChip icon={TrendingDown} tone="bg-vivid-red" label={`Lowest: ${worst.bucket.label} ${formatPct(worst.score)}`} labelClassName="tabular-nums" />}
      </div>

      {asRow ? (
        <div className="flex gap-1.5" role="list" aria-label="Score by day">
          {cells.map((cell) => <Tile key={`${cell.bucket.from}-${cell.bucket.to}`} cell={cell} mode="row" />)}
        </div>
      ) : asCalendar ? (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-7 gap-1.5 text-center" aria-hidden="true">
            {WEEKDAYS.map((d) => <span key={d} className="t-meta font-display font-semibold text-text-muted">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="Score by day">
            {Array.from({ length: lead }, (_, i) => <span key={`pad-${i}`} aria-hidden="true" />)}
            {cells.map((cell) => <Tile key={`${cell.bucket.from}-${cell.bucket.to}`} cell={cell} mode="calendar" />)}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label={`Score by ${unit}`}>
          {cells.map((cell) => <Tile key={`${cell.bucket.from}-${cell.bucket.to}`} cell={cell} mode="bucket" />)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
        <LegendChip color={TONE_COLOR.success} label={`${GOOD_FROM}+ good`} />
        <LegendChip color={TONE_COLOR.warning} label={`${FAIR_FROM} to ${GOOD_FROM - 1} fair`} />
        <LegendChip color={TONE_COLOR.danger} label={`Under ${FAIR_FROM} low`} />
        <LegendChip color="var(--color-border-hover)" label="Nothing due" />
      </div>
    </div>
  );
};
