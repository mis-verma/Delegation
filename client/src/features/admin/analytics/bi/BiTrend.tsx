import { lazy, Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scoreApi, type ChecklistScore, type DelegationScore, type ScoreScope, type TicketScore, type TrendBucket, type TrendPeriod } from '../../../../api/scores';
import { InlineError, Skeleton } from '../../../../components';
import { SCORE_QUERY_OPTIONS } from '../../../dashboard/scoreQueries';
import { MODULE_LABEL } from '../../../../lib/scoreLabels';
import { spanDays } from '../analyticsDisplay';
import type { TrendSeries } from '../ReportTrendChart';
import { BI_MODULES, measureLabel, moduleTitle, type BiMeasure, type BiModule } from './biMetrics';

const ReportTrendChart = lazy(() => import('../ReportTrendChart'));

export interface BiTrendTarget {
  scope: ScoreScope;
  id?: string;
}

const COLOR = {
  checklist: 'var(--color-activity-checklist)',
  ticket: 'var(--color-activity-ticket)',
  delegation: 'var(--color-activity-delegation)',
} as const;

const periodFor = (days: number): TrendPeriod => (days <= 31 ? 'day' : days <= 120 ? 'week' : days <= 700 ? 'month' : 'quarter');

type ModuleScore = ChecklistScore | TicketScore | DelegationScore;

const valueOf = (b: ModuleScore, measure: BiMeasure): number | null => {
  if (b.due === 0) return null;
  if (measure === 'score') return b.score;
  if (measure === 'completion') return b.completionPct;
  if (measure === 'compliance') return b.compliancePct;
  return b.onTimeOfFinishedPct ?? b.onTimePct;
};

const rowFor = (b: TrendBucket, period: TrendPeriod, module: BiModule, measure: BiMeasure) => {
  const bucket = period === 'day' ? b.from : b.label;
  if (module === 'all') {
    return { bucket, checklist: valueOf(b.checklist, 'score'), ticket: valueOf(b.ticket, 'score'), delegation: valueOf(b.delegation, 'score') };
  }
  return { bucket, [module]: valueOf(b[module], measure) };
};

interface BiTrendProps {
  target: BiTrendTarget;
  from: string;
  to: string;
  module: BiModule;
  measure: BiMeasure;
}

export const BiTrend = ({ target, from, to, module, measure }: BiTrendProps) => {
  const period = periodFor(spanDays(from, to));
  const query = useQuery({
    queryKey: ['scores', 'trend', target.scope, target.id ?? 'org', period, from, to],
    queryFn: () => scoreApi.trend({ scope: target.scope, id: target.id, period, from, to }),
    ...SCORE_QUERY_OPTIONS,
  });

  const data = useMemo(() => (query.data?.buckets ?? []).map((b) => rowFor(b, period, module, measure)), [query.data, period, module, measure]);
  const series = useMemo<TrendSeries[]>(
    () => (module === 'all'
      ? BI_MODULES.map((m) => ({ key: m, label: MODULE_LABEL[m], color: COLOR[m] }))
      : [{ key: module, label: `${moduleTitle(module)} ${measureLabel(measure, module).toLowerCase()}`, color: COLOR[module] }]),
    [module, measure],
  );

  return (
    <section aria-label="Trend" className="flex flex-col gap-3 border-t border-border/60 pt-3">
      <h3 className="t-card font-display font-bold text-text">Trend</h3>
      {query.isError ? (
        <InlineError message="Could not load the trend." onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
          <ReportTrendChart data={data} series={series} groupBy={period === 'day' ? 'day' : 'year'} valueSuffix="%" yDomain={[0, 100]} />
        </Suspense>
      )}
    </section>
  );
};
