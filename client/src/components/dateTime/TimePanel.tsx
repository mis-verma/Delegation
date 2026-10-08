import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatClock, toTimeValue, withClock } from './calendarCore';

const QUICK_TIMES: { hour: number; minute: number }[] = [
  { hour: 9, minute: 0 },
  { hour: 12, minute: 0 },
  { hour: 15, minute: 0 },
  { hour: 18, minute: 0 },
];

interface TimePanelProps {
  /** What this time is for: "Start time", "Due time". */
  label: string;
  /** The day and time chosen so far. `null` until a day is picked. */
  value: Date | null;
  onChange: (next: Date) => void;
  /** Earliest moment allowed, e.g. now for a due time today. Earlier picks are refused with a message. */
  minAt?: Date | null;
  /** Called before the user starts editing, e.g. so a picker's auto-close timer is cancelled. */
  onTouch?: () => void;
}

/**
 * A time chosen three ways, whichever is quickest on the device in hand: four one-tap times for a
 * working day, a big readout, and the device's own time control (the wheel on iOS, the clock on
 * Android, the field on a desktop). Shown in 12-hour AM/PM to match the rest of the app.
 */
export const TimePanel = ({ label, value, onChange, minAt, onTouch }: TimePanelProps) => {
  const [error, setError] = useState<string | null>(null);

  const apply = (hour: number, minute: number) => {
    if (!value) return;
    onTouch?.();
    const next = withClock(value, hour, minute);
    if (minAt && next.getTime() < minAt.getTime()) {
      setError('That time has already passed.');
      return;
    }
    setError(null);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-display font-semibold text-text-muted">{label}</span>
        <span className="text-base font-display font-bold text-text tabular-nums">{value ? formatClock(value) : 'Pick a day first'}</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`${label}, quick times`}>
        {QUICK_TIMES.map(({ hour, minute }) => {
          const candidate = value ? withClock(value, hour, minute) : null;
          const selected = !!value && value.getHours() === hour && value.getMinutes() === minute;
          const past = !!candidate && !!minAt && candidate.getTime() < minAt.getTime();
          return (
            <button
              key={hour}
              type="button"
              disabled={!value || past}
              aria-pressed={selected}
              onClick={() => apply(hour, minute)}
              className={cn(
                'h-9 pointer-coarse:h-11 rounded-lg border text-xs font-display font-semibold tabular-nums transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-40 [-webkit-tap-highlight-color:transparent]',
                selected
                  ? 'bg-primary-500/10 dark:bg-primary-500/15 border-primary-500/40 text-primary-700 dark:text-primary-300'
                  : 'border-border/60 bg-surface text-text-secondary hover:border-primary-400',
              )}
            >
              {formatClock(withClock(new Date(2000, 0, 1), hour, minute)).replace(':00', '')}
            </button>
          );
        })}
      </div>

      {/* 16px on a phone: smaller makes iOS zoom the whole page when the field is focused. */}
      <input
        type="time"
        aria-label={`${label}, exact time`}
        disabled={!value}
        value={value ? toTimeValue(value) : ''}
        onFocus={onTouch}
        onPointerDown={onTouch}
        onChange={(e) => {
          const [h, m] = e.target.value.split(':').map(Number);
          if (Number.isNaN(h) || Number.isNaN(m)) return;
          apply(h, m);
        }}
        className="w-full h-11 sm:h-10 rounded-lg border border-border bg-surface px-3 text-base sm:text-sm text-text tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:border-primary-500 disabled:bg-surface-hover disabled:text-text-light disabled:cursor-not-allowed"
      />

      {error && <p className="text-xs text-danger font-display" role="alert">{error}</p>}
    </div>
  );
};
