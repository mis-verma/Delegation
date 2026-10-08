import { useState } from 'react';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Button } from '../button';
import { CalendarGrid, type DayState } from '../dateTime/CalendarGrid';
import { PickerShell } from '../dateTime/PickerShell';
import { ClockPicker } from '../dateTime/ClockPicker';
import {
  DEFAULT_START_HOUR, addDays, formatClock, formatDay, isSameDay, roundUpToQuarter, startOfDay, withClock,
} from '../dateTime/calendarCore';
import { useMediaQuery } from '../../lib/useMediaQuery';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  showTime?: boolean;
  /** Earliest moment that can be picked. Earlier days are greyed out and an earlier time is refused. */
  minDate?: Date;
  /** With `showTime`: the hour (0-23) a freshly picked day starts at. Defaults to the next quarter
   *  hour for today and 9 AM for any other day, never the raw current minute (3:47 PM). */
  defaultHour?: number;
}

const QUICK_PICKS: { label: string; resolve: (today: Date) => Date }[] = [
  { label: 'Today', resolve: (today) => today },
  { label: 'Tomorrow', resolve: (today) => addDays(today, 1) },
  { label: 'Next week', resolve: (today) => addDays(today, 7) },
  { label: 'Next month', resolve: (today) => new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()) },
];

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select a date',
  className = '',
  triggerClassName = '',
  disabled = false,
  showTime = false,
  minDate,
  defaultHour,
}: DatePickerProps) {
  const isPhone = useMediaQuery('(max-width: 639px)');

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfDay(value ?? new Date()));
  // Phones only: date and time are two tabs of one sheet instead of a calendar stacked on a clock.
  const [panel, setPanel] = useState<'date' | 'time'>('date');
  // Re-read on every open, so a tab left open past midnight doesn't call yesterday "today".
  const [today, setToday] = useState(() => startOfDay(new Date()));

  const handleOpenChange = (next: boolean) => {
    if (disabled) return;
    if (next) {
      setViewMonth(startOfDay(value ?? new Date()));
      setPanel('date');
      setToday(startOfDay(new Date()));
    }
    setOpen(next);
  };

  // The time a freshly picked day starts at: the clock already chosen, else a round one.
  const clockFor = (day: Date): Date => {
    if (!showTime) return startOfDay(day);
    let next: Date;
    if (value) next = withClock(day, value.getHours(), value.getMinutes());
    else if (defaultHour !== undefined) next = withClock(day, defaultHour, 0);
    else next = isSameDay(day, today) ? roundUpToQuarter(new Date()) : withClock(day, DEFAULT_START_HOUR, 0);
    if (minDate && next.getTime() < minDate.getTime()) next = roundUpToQuarter(minDate);
    return next;
  };

  const selectDay = (day: Date) => {
    onChange(clockFor(day));
    if (!showTime) setOpen(false);
    // Day picked, so the phone sheet moves on to the next question.
    else if (isPhone) setPanel('time');
  };

  // Every change from the clock goes through the clock's own past-time check; this just saves it.
  const changeTime = (next: Date) => onChange(next);

  const getDayState = (day: Date): DayState => ({
    disabled: !!minDate && day < startOfDay(minDate),
    solid: isSameDay(day, value),
  });

  const dateColumn = (
    <div className="flex flex-col gap-3 w-full sm:w-[17.5rem] min-w-0">
      {/* One row of four, not a wrapping 3 + 1. */}
      <div className="grid grid-cols-4 gap-1" role="group" aria-label="Quick choices">
        {QUICK_PICKS.map((pick) => {
          const target = startOfDay(pick.resolve(today));
          const isActive = isSameDay(value, target);
          const tooEarly = !!minDate && target < startOfDay(minDate);
          return (
            <button
              key={pick.label}
              type="button"
              disabled={tooEarly}
              aria-pressed={isActive}
              onClick={() => { selectDay(target); setViewMonth(target); }}
              className={cn(
                'h-9 pointer-coarse:h-11 px-1 rounded-lg text-xs font-display font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-40 [-webkit-tap-highlight-color:transparent]',
                isActive ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white dark:from-primary-400 dark:to-primary-600' : 'bg-surface-hover/80 text-text-secondary hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300',
              )}
            >
              {pick.label}
            </button>
          );
        })}
      </div>

      <CalendarGrid month={viewMonth} onMonthChange={setViewMonth} getDayState={getDayState} onSelect={selectDay} today={today} />
    </div>
  );

  // The clock sits beside the calendar from sm up and is its own tab on a phone. One component for
  // both, so the time is set the same way on every screen.
  const clock = showTime && (
    <ClockPicker value={value} onChange={changeTime} minAt={minDate ?? null} label="Time" />
  );

  const desktopClock = showTime && !isPhone && (
    <div className="flex w-60 shrink-0 flex-col gap-3 border-l border-border pl-5">
      {clock}
      <button
        type="button"
        disabled={!value}
        onClick={() => setOpen(false)}
        className="w-full h-9 pointer-coarse:h-11 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 hover:brightness-110 text-white text-sm font-display font-semibold tabular-nums transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {value ? `Set ${formatDay(value)}, ${formatClock(value)}` : 'Pick a day first'}
      </button>
    </div>
  );

  const phoneTabs = showTime && (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-hover/80 sm:hidden">
      {([
        { key: 'date', label: 'Date', text: value ? formatDay(value) : 'Pick a day' },
        { key: 'time', label: 'Time', text: value ? formatClock(value) : 'Day first' },
      ] as const).map((tab) => (
        <button
          key={tab.key}
          type="button"
          disabled={tab.key === 'time' && !value}
          aria-pressed={panel === tab.key}
          onClick={() => setPanel(tab.key)}
          className={cn(
            'flex flex-col items-start gap-0.5 min-h-12 px-3 py-1.5 rounded-lg text-left transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-50',
            panel === tab.key ? 'bg-surface border border-border' : 'border border-transparent',
          )}
        >
          <span className="text-xs font-display font-semibold text-text-muted leading-none">{tab.label}</span>
          <span className={cn('text-sm font-display font-semibold leading-tight tabular-nums', panel === tab.key ? 'text-text' : 'text-text-secondary')}>{tab.text}</span>
        </button>
      ))}
    </div>
  );

  return (
    <PickerShell
      open={open}
      onOpenChange={handleOpenChange}
      title={showTime ? 'Date and time' : 'Pick a date'}
      sheetFooter={showTime && (
        <Button variant="primary" onClick={() => setOpen(false)} disabled={!value} className="w-full h-11 font-display">
          {value ? `Set ${formatDay(value)}, ${formatClock(value)}` : 'Pick a day first'}
        </Button>
      )}
      trigger={
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'w-full flex items-center gap-2.5 h-10 pointer-coarse:min-h-11 px-2.5 rounded-xl border bg-surface text-sm transition-all cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-primary-500/15 focus-visible:border-primary-400',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-hover',
            open ? 'border-primary-500' : 'border-border/70 hover:border-primary-400/70',
            value && 'pr-9 pointer-coarse:pr-11',
            className,
            triggerClassName,
          )}
        >
          <span className="flex items-center justify-center size-6 rounded-lg bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 shrink-0"><CalendarIcon size={14} strokeWidth={2.4} /></span>
          <span className={cn('truncate', value ? 'text-text font-medium' : 'text-text-light font-medium')}>
            {value ? formatDay(value) + (showTime ? ` • ${formatClock(value)}` : '') : placeholder}
          </span>
        </button>
      }
      triggerAside={value && !disabled && (
        // A sibling of the trigger, not nested inside it, so it is a real button of its own.
        <button
          type="button"
          aria-label="Clear date"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 text-text-light bg-surface-hover hover:bg-danger/10 hover:text-danger rounded-full transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
          }}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      )}
    >
      {phoneTabs}
      <div className="flex flex-col sm:flex-row sm:gap-5">
        <div className={cn(showTime && panel === 'time' && 'max-sm:hidden')}>{dateColumn}</div>

        {/* Phone: the clock is its own tab. */}
        {showTime && isPhone && panel === 'time' && clock}

        {desktopClock}
      </div>
    </PickerShell>
  );
}
