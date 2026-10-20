import { cn } from '@/lib/utils';

interface WindowTimelineProps {
  opensTime: string;
  cutoffTime: string;
  lateUntilTime: string;
}

const MINUTES_IN_DAY = 24 * 60;
const TICKS = [
  { at: 0, label: '12 AM' },
  { at: 6, label: '6 AM' },
  { at: 12, label: '12 PM' },
  { at: 18, label: '6 PM' },
  { at: 24, label: '12 AM' },
];

const toMinutes = (value: string): number | null => {
  const [h, m] = value.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const clock = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

type Segment = { from: number; to: number; tone: 'open' | 'late' };

const spans = (from: number, to: number, tone: Segment['tone']): Segment[] =>
  to > from ? [{ from, to, tone }] : [{ from, to: MINUTES_IN_DAY, tone }, { from: 0, to, tone }];

export const WindowTimeline = ({ opensTime, cutoffTime, lateUntilTime }: WindowTimelineProps) => {
  const open = toMinutes(opensTime);
  const close = toMinutes(cutoffTime);
  const late = toMinutes(lateUntilTime);
  const start = open ?? 0;
  const end = close ?? MINUTES_IN_DAY;
  if (open !== null && close !== null && open === close) return null;

  const segments: Segment[] = [
    ...(open === null && close === null ? [{ from: 0, to: MINUTES_IN_DAY, tone: 'open' as const }] : spans(start, end % MINUTES_IN_DAY || MINUTES_IN_DAY, 'open')),
    ...(close !== null && late !== null && late !== close ? spans(close, late, 'late') : []),
  ];

  const summary = open === null && close === null
    ? 'Open all day'
    : `Open ${open === null ? 'from the start of the day' : clock(opensTime)} to ${close === null ? 'the end of the day' : clock(cutoffTime)}${late !== null && close !== null && late !== close ? `, late until ${clock(lateUntilTime)}` : ''}`;

  return (
    <figure className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-surface-hover/40 p-3" aria-label={summary}>
      <div className="relative h-3 overflow-hidden rounded-full bg-border/60">
        {segments.map((seg, i) => (
          <span
            key={i}
            className={cn('absolute inset-y-0 rounded-full', seg.tone === 'open' ? 'bg-success' : 'bg-danger/80')}
            style={{ left: `${(seg.from / MINUTES_IN_DAY) * 100}%`, width: `${((seg.to - seg.from) / MINUTES_IN_DAY) * 100}%` }}
          />
        ))}
      </div>
      <div className="relative h-4" aria-hidden="true">
        {TICKS.map((tick) => (
          <span
            key={tick.at}
            className={cn('absolute t-meta font-display tabular-nums text-text-light', tick.at === 0 ? 'left-0' : tick.at === 24 ? 'right-0' : '-translate-x-1/2')}
            style={tick.at === 0 || tick.at === 24 ? undefined : { left: `${(tick.at / 24) * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 t-meta font-display text-text-secondary">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" aria-hidden="true" />{summary}</span>
        {late !== null && close !== null && late !== close && <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-danger/80" aria-hidden="true" />Late window</span>}
      </figcaption>
    </figure>
  );
};
