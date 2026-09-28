import { cn } from '@/lib/utils';

// Monday-first, as people here read a week. Values match Date#getDay (0 = Sunday … 6 = Saturday),
// which is also what the server stores.
const DAYS = [
  { value: 1, short: 'Mon', letter: 'M' },
  { value: 2, short: 'Tue', letter: 'T' },
  { value: 3, short: 'Wed', letter: 'W' },
  { value: 4, short: 'Thu', letter: 'T' },
  { value: 5, short: 'Fri', letter: 'F' },
  { value: 6, short: 'Sat', letter: 'S' },
  { value: 0, short: 'Sun', letter: 'S' },
] as const;

const DAY_NAME: Record<number, string> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };

// eslint-disable-next-line react-refresh/only-export-components
export const weekdayShortName = (day: number) => DAYS.find((d) => d.value === day)?.short ?? '';

/** "Mon – Sat", "Every day", "Mon, Wed, Fri" — for summaries (review step, detail page). */
// eslint-disable-next-line react-refresh/only-export-components
export const formatWeekdays = (days: number[] | null | undefined): string => {
  if (!days || days.length === 7) return 'Every day';
  if (!days.length) return 'No days';
  const ordered = DAYS.filter((d) => days.includes(d.value));
  // A single unbroken run in Monday-first order reads as a range.
  const idx = ordered.map((d) => DAYS.findIndex((x) => x.value === d.value));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && ordered.length > 2) return `${ordered[0].short} – ${ordered[ordered.length - 1].short}`;
  return ordered.map((d) => d.short).join(', ');
};

interface WeekdayPickerProps {
  value: number[];
  onChange: (days: number[]) => void;
  /** "on" = days it runs (filled primary); "off" = days off (filled muted/warning). */
  tone?: 'on' | 'off';
  /** Stops the last selected day from being cleared (a checklist needs at least one working day). */
  minSelected?: number;
  /** Stops selecting beyond this many (a week-off can't be the whole week). */
  maxSelected?: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const WeekdayPicker = ({
  value,
  onChange,
  tone = 'on',
  minSelected = 0,
  maxSelected = 7,
  disabled,
  className,
  'aria-label': ariaLabel,
}: WeekdayPickerProps) => {
  const toggle = (day: number) => {
    const on = value.includes(day);
    if (on && value.length <= minSelected) return;
    if (!on && value.length >= maxSelected) return;
    onChange(on ? value.filter((d) => d !== day) : [...value, day].sort());
  };

  return (
    <div role="group" aria-label={ariaLabel} className={cn('grid grid-cols-7 gap-1.5 w-full max-w-md', className)}>
      {DAYS.map((d) => {
        const selected = value.includes(d.value);
        return (
          <button
            key={d.value}
            type="button"
            aria-pressed={selected}
            aria-label={DAY_NAME[d.value]}
            title={DAY_NAME[d.value]}
            disabled={disabled}
            onClick={() => toggle(d.value)}
            className={cn(
              'flex flex-col items-center justify-center h-11 rounded-xl border text-xs font-display font-semibold transition-all duration-150 cursor-pointer select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
              selected
                ? tone === 'on'
                  ? 'bg-primary-700 border-primary-700 text-white dark:bg-primary-500 dark:border-primary-500'
                  : 'bg-warning/15 border-warning/40 text-warning'
                : 'bg-surface border-border text-text-secondary hover:bg-surface-hover hover:text-text',
            )}
          >
            <span className="sm:hidden">{d.letter}</span>
            <span className="hidden sm:inline">{d.short}</span>
          </button>
        );
      })}
    </div>
  );
};
