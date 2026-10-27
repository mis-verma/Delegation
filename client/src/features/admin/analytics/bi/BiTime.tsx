import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import type { MatrixBucket, MatrixParams } from '../../../../api/scores';
import { InlineError, Skeleton } from '../../../../components';
import { BiTrend } from './BiTrend';
import { HeatGrid } from './HeatGrid';
import { PERIOD_NOUN } from './biTimeUtils';
import type { BiMeasure, BiModule, DetailRow } from './biMetrics';
import { useBiMatrix } from './useBiMatrix';
import type { BiChart } from './useBiPrefs';

const ColumnsChart = lazy(() => import('./ColumnsChart'));

const TITLE: Record<BiChart, string> = { bars: 'Trend', rings: 'Trend', columns: 'Score over time', heat: 'Heatmap over time' };

interface BiTimeProps {
  chart: BiChart;
  params: MatrixParams | null;
  module: BiModule;
  measure: BiMeasure;
  lowestFirst: boolean;
  totalLabel: string;
  onZoom: (bucket: MatrixBucket) => void;
  onOpen: (row: DetailRow, bucketIndex: number | null) => void;
}

export const BiTime = ({ chart, params, module, measure, lowestFirst, totalLabel, onZoom, onOpen }: BiTimeProps) => {
  const query = useBiMatrix(params);
  const matrix = query.data;
  const heading = matrix ? `${TITLE[chart]}, ${PERIOD_NOUN[matrix.period]} by ${PERIOD_NOUN[matrix.period]}` : TITLE[chart];

  return (
    <section aria-label={heading} className={cn('flex flex-col gap-3', chart === 'bars' || chart === 'rings' ? 'border-t border-border/60 pt-3' : '')}>
      <h3 className="t-card font-display font-bold text-text">{heading}</h3>
      {query.isError && !matrix ? (
        <InlineError message="Could not load the time view." onRetry={() => void query.refetch()} />
      ) : !matrix ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <div className={cn(query.updating && 'opacity-70 transition-opacity')} aria-busy={query.updating}>
          {chart === 'heat' ? (
            <HeatGrid matrix={matrix} module={module} measure={measure} lowestFirst={lowestFirst} totalLabel={totalLabel} onOpen={onOpen} />
          ) : chart === 'columns' ? (
            <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
              <ColumnsChart matrix={matrix} module={module} measure={measure} onZoom={onZoom} />
            </Suspense>
          ) : (
            <BiTrend matrix={matrix} module={module} measure={measure} />
          )}
        </div>
      )}
    </section>
  );
};
