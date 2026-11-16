import { memo, useMemo } from 'react';
import { PANEL_CLASS } from '../../components';
import { cn } from '@/lib/utils';
import type { LeaveEntry } from '../../api/leave';
import { WEEK, addDays, asUtc } from './leaveDisplay';

const WEEKDAY_SHORT = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });

export const WeekStrip = memo(({ entries, today }: { entries: LeaveEntry[]; today: string }) => {
  const days = useMemo(() => Array.from({ length: WEEK }, (_, i) => addDays(today, i)).map((date) => ({
    date,
    away: entries.filter((e) => e.startDate <= date && e.endDate >= date),
  })), [entries, today]);
  return (
    <section aria-label="Who is away this week" className={cn(PANEL_CLASS, 'flex flex-col gap-2 p-3 sm:p-4')}>
      <h2 className="t-card font-display font-bold text-text">Next 7 days</h2>
      <ul className="grid grid-cols-7 gap-1.5">
        {days.map(({ date, away }, i) => (
          <li
            key={date}
            title={away.length ? away.map((a) => a.userName).join(', ') : 'Nobody away'}
            className={cn(
              'flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 leading-none',
              i === 0 ? 'border-primary-500/40 bg-primary-500/10' : 'border-border/60 bg-surface',
            )}
          >
            <span className="t-meta font-display font-semibold text-text-muted">{WEEKDAY_SHORT.format(asUtc(date))}</span>
            <span className="t-card font-display font-bold tabular-nums text-text">{asUtc(date).getUTCDate()}</span>
            <span className={cn('t-meta font-display font-bold tabular-nums', away.length ? 'text-vivid-blue-text' : 'text-text-light')}>{away.length || '-'}</span>
          </li>
        ))}
      </ul>
      <p className="t-meta text-text-muted">The number is how many people are away that day.</p>
    </section>
  );
});
WeekStrip.displayName = 'WeekStrip';
