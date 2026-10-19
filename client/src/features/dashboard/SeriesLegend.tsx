import { LegendChip } from '../../components/legendChip';
import { SERIES_COLOR, type SeriesKey } from './scoreMetrics';

export const SeriesLegend = ({ series, labels }: { series: SeriesKey[]; labels: Record<SeriesKey, string> }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {series.map((k) => (
      <LegendChip key={k} color={SERIES_COLOR[k]} label={labels[k]} />
    ))}
  </div>
);
