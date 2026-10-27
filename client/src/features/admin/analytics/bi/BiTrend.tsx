import { lazy, Suspense, useMemo } from 'react';
import type { MatrixCell, MatrixResponse } from '../../../../api/scores';
import { Skeleton } from '../../../../components';
import { MODULE_LABEL } from '../../../../lib/scoreLabels';
import type { TrendSeries } from '../ReportTrendChart';
import { bucketLabel } from './biTimeUtils';
import { BI_MODULES, cellValue, measureLabel, moduleTitle, type BiMeasure, type BiModule } from './biMetrics';

const ReportTrendChart = lazy(() => import('../ReportTrendChart'));

const COLOR = {
  checklist: 'var(--color-activity-checklist)',
  ticket: 'var(--color-activity-ticket)',
  delegation: 'var(--color-activity-delegation)',
} as const;

const rowFor = (cell: MatrixCell, bucket: string, module: BiModule, measure: BiMeasure) => {
  if (module === 'all') {
    return { bucket, checklist: cellValue(cell, 'checklist', 'score'), ticket: cellValue(cell, 'ticket', 'score'), delegation: cellValue(cell, 'delegation', 'score') };
  }
  return { bucket, [module]: cellValue(cell, module, measure) };
};

interface BiTrendProps {
  matrix: MatrixResponse;
  module: BiModule;
  measure: BiMeasure;
}

export const BiTrend = ({ matrix, module, measure }: BiTrendProps) => {
  const { period, buckets } = matrix;
  const data = useMemo(
    () => matrix.total.cells.map((cell, i) => {
      const b = buckets[i];
      return rowFor(cell, period === 'day' ? b?.from ?? '' : b ? bucketLabel(period, b) : '', module, measure);
    }),
    [matrix.total.cells, buckets, period, module, measure],
  );
  const series = useMemo<TrendSeries[]>(
    () => (module === 'all'
      ? BI_MODULES.map((m) => ({ key: m, label: MODULE_LABEL[m], color: COLOR[m] }))
      : [{ key: module, label: `${moduleTitle(module)} ${measureLabel(measure, module).toLowerCase()}`, color: COLOR[module] }]),
    [module, measure],
  );

  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <ReportTrendChart data={data} series={series} groupBy={period === 'day' ? 'day' : 'year'} valueSuffix="%" yDomain={[0, 100]} />
    </Suspense>
  );
};
