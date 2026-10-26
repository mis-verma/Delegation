import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { scoreApi, type ScoreScope, type ScoreTrend, type TrendBucket, type TrendPeriod } from '../../api/scores';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { bandWord, FAIR_FROM, GOOD_FROM } from '../../lib/scoreBands';
import { formatPct, roundPct } from '../../lib/percent';
import { SCORE_QUERY_OPTIONS } from './scoreQueries';

const MODULE_KEYS = ['checklist', 'ticket', 'delegation'] as const;

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

const cellTone = (v: number | null) =>
  v === null ? 'bg-surface-hover text-text-light' : v >= GOOD_FROM ? 'bg-success text-white' : v >= FAIR_FROM ? 'bg-warning text-white' : 'bg-danger text-white';

const cellText = (b: TrendBucket) => {
  const last = b.label.trim().split(/\s+/);
  const digits = last.find((part) => /^\d{1,2}$/.test(part));
  return digits ?? b.label.slice(0, 3);
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
  const cells = useMemo(() => (data?.buckets ?? []).map((b) => ({ bucket: b, score: bucketScore(b) })), [data]);
  const scored = cells.filter((c): c is { bucket: TrendBucket; score: number } => c.score !== null);
  const average = scored.length ? roundPct(scored.reduce((t, c) => t + c.score, 0) / scored.length) : null;
  const best = scored.length ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const worst = scored.length > 1 ? scored.reduce((a, b) => (b.score < a.score ? b : a)) : null;
  const unit = period === 'day' ? 'day' : period === 'week' ? 'week' : 'period';

  if (isPending) {
    return (
      <div className="flex flex-wrap gap-1.5" role="status" aria-label="Loading the days">
        {Array.from({ length: 14 }, (_, i) => <Skeleton key={i} className="size-8 rounded-md" />)}
      </div>
    );
  }
  if (isError) return <InlineError message="Couldn't load the days." onRetry={() => void refetch()} />;
  if (cells.length === 0 || scored.length === 0) {
    return <p className="t-meta text-text-muted">Nothing came due in this window, so there is nothing to colour yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5" role="list" aria-label={`Score by ${unit}`}>
        {cells.map(({ bucket, score }) => {
          const text = score === null ? 'nothing due' : `${formatPct(score)}, ${bandWord(score)}`;
          return (
            <span
              key={`${bucket.from}-${bucket.to}`}
              role="listitem"
              title={`${bucket.label}: ${text}`}
              aria-label={`${bucket.label}: ${text}`}
              className={cn('flex size-8 shrink-0 items-center justify-center rounded-md t-meta font-display font-bold tabular-nums', cellTone(score))}
            >
              {cellText(bucket)}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 t-meta text-text-muted">
        {average !== null && <span>Average <span className="font-display font-bold tabular-nums text-text">{formatPct(average)}</span></span>}
        {best && <span>Best {unit} <span className="font-display font-bold text-text">{best.bucket.label}</span> {formatPct(best.score)}</span>}
        {worst && <span>Lowest <span className="font-display font-bold text-text">{worst.bucket.label}</span> {formatPct(worst.score)}</span>}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 t-meta text-text-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success" />{GOOD_FROM}+ good</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warning" />{FAIR_FROM} to {GOOD_FROM - 1} fair</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-danger" />under {FAIR_FROM} low</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-surface-hover ring-1 ring-border" />nothing due</span>
      </p>
    </div>
  );
};
