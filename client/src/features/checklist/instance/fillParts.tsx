import { cn } from '@/lib/utils';
import { formatPct } from '../../../lib/percent';
import { fillBand, fillTone, formatCount, type FillBand } from './fillCount';

const BAND_LABEL: Record<FillBand, string> = { good: 'On track', fair: 'Slipping', low: 'Behind' };
const BAND_CHIP: Record<FillBand, string> = {
  good: 'bg-vivid-green/10 text-vivid-green-text ring-vivid-green/25',
  fair: 'bg-vivid-sky/10 text-vivid-sky-text ring-vivid-sky/25',
  low: 'bg-vivid-red/10 text-vivid-red-text ring-vivid-red/25',
};

export const ScoreBadge = ({ pct, caption }: { pct: number | null | undefined; caption: string }) => {
  if (pct == null) {
    return (
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="t-stat font-figure font-bold leading-none text-text-light">-</span>
        <span className="t-meta font-medium text-text-muted">Nothing due</span>
      </span>
    );
  }
  const band = fillBand(pct);
  return (
    <span className="flex shrink-0 flex-col items-end gap-1" title={caption}>
      <span className={cn('t-stat font-figure font-bold leading-none tabular-nums', fillTone(pct).text)}>{formatPct(pct)}</span>
      <span className={cn('rounded-full px-2 py-0.5 t-meta font-semibold ring-1 ring-inset', BAND_CHIP[band])}>{BAND_LABEL[band]}</span>
    </span>
  );
};

export const ScoreTrack = ({ pct, thick = false }: { pct: number | null | undefined; thick?: boolean }) => (
  <span className={cn('block w-full overflow-hidden rounded-full bg-border/60', thick ? 'h-2' : 'h-1.5')} aria-hidden="true">
    {pct != null && (
      <span
        className={cn('block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none', fillTone(pct).bar)}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    )}
  </span>
);

interface MetricBarProps {
  label: string;
  done: number | undefined;
  due: number | undefined;
  pct: number | null | undefined;
  unit?: string;
}

export const MetricBar = ({ label, done, due, pct, unit }: MetricBarProps) => {
  const empty = done === undefined || due === undefined || due === 0 || pct == null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-meta font-display font-semibold text-text-secondary">{label}</span>
        <span className="flex items-baseline gap-1.5 tabular-nums">
          {!empty && <span className="t-meta text-text-muted">{formatCount(done)} of {formatCount(due)}{unit ? ` ${unit}` : ''}</span>}
          <span className={cn('t-card font-display font-bold', empty ? 'text-text-light' : fillTone(pct).text)}>{empty ? '-' : formatPct(pct)}</span>
        </span>
      </div>
      <ScoreTrack pct={empty ? null : pct} />
    </div>
  );
};

export interface StackSegment {
  key: string;
  label: string;
  value: number;
  className: string;
}

export const StackBar = ({ segments, label }: { segments: StackSegment[]; label: string }) => {
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <div className="flex flex-col gap-2">
      <span role="img" aria-label={`${label}: ${segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}`} className="flex h-2 w-full overflow-hidden rounded-full bg-border/60">
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => (
          <span key={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.className)} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
      </span>
      <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 t-meta text-text-muted">
            <span className={cn('size-2 rounded-full', s.className)} />
            <span className="font-semibold tabular-nums text-text">{s.value}</span>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
};
