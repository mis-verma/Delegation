import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type { useCreatedRange } from '../../lib/createdRange';

type CreatedRangeState = ReturnType<typeof useCreatedRange>;

interface CreatedRangePickerProps {
  createdRange: CreatedRangeState;
  className?: string;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const SHORT_DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const MONTH_TITLE = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() === b.getTime();

// Six rows of seven days starting on a Monday, so the grid never changes height between months.
const monthGrid = (month: Date) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i));
};

/**
 * "Created on" for a list page: a small button that opens a compact calendar popup (not a full-screen
 * dialog). Tap a start day then an end day (the same day twice is one day), or use a shortcut: Today,
 * Yesterday, Last 7 days, This month. The list narrows to items created in it, and the banner above the
 * page says so. It is the same filter a chart bar links to, so the two always agree.
 */
export const CreatedRangePicker = ({ createdRange, className }: CreatedRangePickerProps) => {
  const { range, set, clear } = createdRange;
  const [today] = useState(() => dayOf(new Date()));
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [start, setStart] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  // The last day just tapped. The popup holds for a beat with the whole range lit up, then closes by
  // itself, so the person sees what they picked before it goes.
  const [end, setEnd] = useState<Date | null>(null);
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  const grid = useMemo(() => monthGrid(viewMonth), [viewMonth]);

  const applied = range ? { from: dayOf(new Date(range.from)), to: dayOf(new Date(range.to - 1)) } : null;
  // While a start day is chosen the highlight follows the pointer to the possible end day.
  const shown = start
    ? (() => {
        const other = end ?? hover ?? start;
        return start <= other ? { from: start, to: other } : { from: other, to: start };
      })()
    : applied;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      setStart(null);
      setHover(null);
      setEnd(null);
      const anchor = applied?.from ?? today;
      setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    }
  };

  const commit = (from: Date, to: Date) => {
    set(from, to);
    setStart(null);
    setEnd(null);
    setOpen(false);
  };

  const pick = (day: Date) => {
    if (end) return; // already choosing: ignore taps while the popup is closing
    if (!start) {
      setStart(day);
      return;
    }
    setEnd(day);
    const from = start <= day ? start : day;
    const to = start <= day ? day : start;
    closeTimer.current = window.setTimeout(() => commit(from, to), 260);
  };

  const presets: Array<{ label: string; from: Date; to: Date }> = [
    { label: 'Today', from: today, to: today },
    { label: 'Yesterday', from: addDays(today, -1), to: addDays(today, -1) },
    { label: 'Last 7 days', from: addDays(today, -6), to: today },
    { label: 'This month', from: new Date(today.getFullYear(), today.getMonth(), 1), to: new Date(today.getFullYear(), today.getMonth() + 1, 0) },
  ];

  const label = applied
    ? sameDay(applied.from, applied.to)
      ? SHORT_DAY.format(applied.from)
      : `${SHORT_DAY.format(applied.from)} to ${SHORT_DAY.format(applied.to)}`
    : 'Created on';

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          className={cn(
            'inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-full border text-sm font-display font-medium outline-none cursor-pointer transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40',
            applied
              ? 'border-primary-500/40 bg-primary-500/10 text-primary-700 dark:text-primary-300'
              : 'border-border bg-surface text-text-secondary hover:border-border-hover hover:text-text',
            className,
          )}
        >
          <CalendarDays size={16} aria-hidden className="shrink-0" />
          <span className="sr-only">{label}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[19.5rem] p-3 flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick ranges">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => commit(preset.from, preset.to)}
              className="h-8 pointer-coarse:h-11 px-2.5 rounded-full border border-border/70 bg-surface-hover/50 text-xs font-display font-semibold text-text-secondary hover:border-primary-500/40 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
            aria-label="Previous month"
            className="flex items-center justify-center size-8 pointer-coarse:size-11 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronLeft size={16} />
          </button>
          <p className="text-sm font-display font-bold text-text tracking-tight">{MONTH_TITLE.format(viewMonth)}</p>
          <button
            type="button"
            onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
            aria-label="Next month"
            className="flex items-center justify-center size-8 pointer-coarse:size-11 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div role="grid" aria-label={MONTH_TITLE.format(viewMonth)} className="flex flex-col gap-1" onMouseLeave={() => setHover(null)}>
          <div className="grid grid-cols-7 text-center">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1 text-xs font-display font-semibold text-text-muted">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {grid.map((day) => {
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const isEnd = !!shown && (sameDay(day, shown.from) || sameDay(day, shown.to));
              const inside = !!shown && day >= shown.from && day <= shown.to;
              return (
                <button
                  key={day.getTime()}
                  type="button"
                  onClick={() => pick(day)}
                  onMouseEnter={() => start && setHover(day)}
                  aria-label={day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  aria-pressed={isEnd}
                  className={cn(
                    'flex items-center justify-center h-9 pointer-coarse:h-11 text-sm font-display tabular-nums outline-none cursor-pointer transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-primary-500/40',
                    isEnd
                      ? 'rounded-lg bg-primary-700 text-white font-semibold dark:bg-primary-600'
                      : inside
                        ? 'bg-primary-500/15 text-text'
                        : cn('rounded-lg hover:bg-surface-hover', inMonth ? 'text-text' : 'text-text-light'),
                    !isEnd && sameDay(day, today) && 'ring-1 ring-primary-500/50',
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          <p className="text-xs font-display text-text-muted">
            {end ? 'Applied' : start ? 'Now pick the last day' : 'Pick the first day'}
          </p>
          {(range || start) && (
            <button
              type="button"
              onClick={() => {
                setStart(null);
                clear();
                setOpen(false);
              }}
              className="h-8 pointer-coarse:h-11 px-2.5 rounded-lg text-xs font-display font-semibold text-text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
