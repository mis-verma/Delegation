import { SERIES_COLOR, type SeriesKey } from './scoreMetrics';

/** The legend under a score chart: one neutral chip per measure, its colour dot first. Shared by Bars and Trend so they match. */
export const SeriesLegend = ({ series, labels }: { series: SeriesKey[]; labels: Record<SeriesKey, string> }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {series.map((k) => (
      <span
        key={k}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 t-meta font-display font-semibold text-text"
        style={{ backgroundColor: `color-mix(in srgb, ${SERIES_COLOR[k]} 12%, transparent)`, borderColor: `color-mix(in srgb, ${SERIES_COLOR[k]} 30%, transparent)` }}
      >
        <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: SERIES_COLOR[k] }} />
        {labels[k]}
      </span>
    ))}
  </div>
);
