import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MatrixBucket, MatrixResponse } from '../../../../api/scores';
import { formatPct, roundPct } from '../../../../lib/percent';
import { GOOD_FROM } from '../../../../lib/scoreBands';
import { TONE_COLOR, toneOf } from '../../../dashboard/scoreTone';
import { bucketShortLabel, bucketTitle, PERIOD_NOUN } from './biTimeUtils';
import { cellDue, cellValue, measureLabel, moduleTitle, type BiMeasure, type BiModule } from './biMetrics';

const BAR_SLOT = 34;
const CHART_HEIGHT = 260;

interface Point {
  short: string;
  title: string;
  value: number | null;
  due: number;
}

interface TipProps {
  active?: boolean;
  payload?: { payload: Point }[];
}

const Tip = ({ active, payload }: TipProps) => {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="flex min-w-40 flex-col gap-1 rounded-xl border border-border bg-surface p-3">
      <p className="t-meta font-display font-bold text-text-secondary">{point.title}</p>
      <p className="t-card font-display font-bold text-text tabular-nums">{point.value === null ? 'Nothing due' : formatPct(point.value)}</p>
      <p className="t-meta text-text-muted">{point.due} due</p>
    </div>
  );
};

interface ColumnsChartProps {
  matrix: MatrixResponse;
  module: BiModule;
  measure: BiMeasure;
  onZoom: (bucket: MatrixBucket) => void;
}

const ColumnsChart = ({ matrix, module, measure, onZoom }: ColumnsChartProps) => {
  const { period, buckets } = matrix;
  const data = useMemo<Point[]>(
    () => buckets.map((b, i) => {
      const cell = matrix.total.cells[i] ?? null;
      return { short: bucketShortLabel(period, b), title: bucketTitle(period, b), value: roundPct(cellValue(cell, module, measure)), due: cellDue(cell, module) };
    }),
    [buckets, matrix.total.cells, period, module, measure],
  );
  const noun = PERIOD_NOUN[period];
  const zoomable = buckets.length > 1;
  const label = `${moduleTitle(module)} ${measureLabel(measure, module).toLowerCase()} by ${noun}`;

  if (data.every((p) => p.value === null)) {
    return <p className="rounded-xl border border-border px-4 py-8 text-center t-card font-medium text-text-muted">Nothing was due in any {noun} of this period.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto overscroll-x-contain pb-1">
        <div role="img" aria-label={label} style={{ minWidth: data.length * BAR_SLOT }}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 4" strokeOpacity={0.7} />
              <XAxis dataKey="short" tickLine={false} axisLine={false} interval={data.length > 16 ? 'preserveStartEnd' : 0} minTickGap={4} tickMargin={8} tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} width={38} tickFormatter={(v: unknown) => `${v}%`} tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600 }} />
              <ReferenceLine y={GOOD_FROM} stroke="var(--color-success)" strokeDasharray="5 5" strokeOpacity={0.65} />
              <Tooltip content={<Tip />} cursor={{ fill: 'var(--color-surface-hover)', opacity: 0.6 }} isAnimationActive={false} />
              <Bar
                dataKey="value"
                radius={[5, 5, 0, 0]}
                cursor={zoomable ? 'pointer' : 'default'}
                onClick={(_: unknown, index: number) => {
                  const bucket = buckets[index];
                  if (zoomable && bucket) onZoom(bucket);
                }}
                animationDuration={500}
              >
                {data.map((p, i) => <Cell key={i} fill={TONE_COLOR[toneOf(p.value)]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="t-meta font-medium text-text-muted">
        The dashed line marks {GOOD_FROM}%, a good score.{zoomable ? ` Tap a column to zoom into that ${noun}.` : ''}
      </p>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Score</th><th scope="col">Due</th></tr></thead>
        <tbody>
          {data.map((p, i) => (
            <tr key={i}><th scope="row">{p.title}</th><td>{p.value === null ? 'Nothing due' : formatPct(p.value)}</td><td>{p.due}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ColumnsChart;
