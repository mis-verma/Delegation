import { SERIES_COLOR, type SeriesKey } from './scoreMetrics';

interface SeriesLegendProps {
  series: SeriesKey[];
  labels: Record<SeriesKey, string>;
}

export const SeriesLegend = ({ series, labels }: SeriesLegendProps) => (
  <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Legend">
    {series.map((k) => (
      <li key={k} className="inline-flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
        <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES_COLOR[k] }} />
        {labels[k]}
      </li>
    ))}
  </ul>
);
