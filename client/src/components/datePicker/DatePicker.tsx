import { useState } from 'react';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Button } from '../button';
import { CalendarGrid, type DayState } from '../dateTime/CalendarGrid';
import { PickerShell } from '../dateTime/PickerShell';
import { TimePanel } from '../dateTime/TimePanel';
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

const HOUR_MARKS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_MARKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// A bigger dial on touch screens, where the 28px marks of the mouse dial are too small to hit and
// neighbouring marks would overlap if they simply grew.
const DIAL_MOUSE = { size: 148, radius: 58, mark: 'size-7' };
const DIAL_TOUCH = { size: 216, radius: 88, mark: 'size-10' };

const segClass = (on: boolean) => cn(
  'px-2 py-1 pointer-coarse:py-2 rounded-md text-sm font-semibold tabular-nums transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
  on ? 'bg-surface text-primary-600 dark:text-primary-300 border border-border' : 'text-text-muted border border-transparent hover:text-text',
);

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
  const coarse = useMediaQuery('(pointer: coarse)');
  const dial = coarse ? DIAL_TOUCH : DIAL_MOUSE;
  const dialCenter = dial.size / 2;

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfDay(value ?? new Date()));
  const [dialMode, setDialMode] = useState<'hour' | 'minute'>('hour');
  // Phones only: date and time are two tabs of one sheet instead of a calendar stacked on a clock.
  const [panel, setPanel] = useState<'date' | 'time'>('date');
  // Re-read on every open, so a tab left open past midnight doesn't call yesterday "today".
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [timeError, setTimeError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (disabled) return;
    if (next) {
      setViewMonth(startOfDay(value ?? new Date()));
      setDialMode('hour');
      setPanel('date');
      setToday(startOfDay(new Date()));
      setTimeError(null);
    }
    setOpen(next);
  };

  const dialMarkPosition = (index: number) => {
    const angle = (index / 12) * 2 * Math.PI - Math.PI / 2;
    return { left: dialCenter + dial.radius * Math.cos(angle), top: dialCenter + dial.radius * Math.sin(angle) };
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
    setTimeError(null);
    onChange(clockFor(day));
    if (!showTime) setOpen(false);
    // Day picked, so the phone sheet moves on to the next question.
    else if (isPhone) setPanel('time');
  };

  // Every time change goes through here, so a past time is refused the same way on the dial and in the
  // phone's time panel.
  const changeTime = (next: Date) => {
    if (minDate && next.getTime() < minDate.getTime()) {
      setTimeError('That time has already passed.');
      return;
    }
    setTimeError(null);
    onChange(next);
  };

  const selectHour = (hour12: number) => {
    if (!value) return;
    const isPM = value.getHours() >= 12;
    const next = new Date(value);
    next.setHours((hour12 % 12) + (isPM ? 12 : 0));
    changeTime(next);
    setDialMode('minute');
  };

  const selectMinute = (minute: number) => {
    if (!value) return;
    const next = new Date(value);
    next.setMinutes(minute);
    changeTime(next);
  };

  const setPeriod = (period: 'AM' | 'PM') => {
    if (!value) return;
    const h = value.getHours();
    const isPM = h >= 12;
    if ((period === 'PM') === isPM) return;
    const next = new Date(value);
    next.setHours(period === 'PM' ? h + 12 : h - 12);
    changeTime(next);
  };

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
                isActive ? 'bg-primary-600 text-white' : 'bg-surface-hover text-text-secondary hover:bg-surface-active hover:text-text',
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

  // Desktop and tablet: the analogue dial. Phones get the TimePanel below instead.
  const dialColumn = (() => {
    if (!showTime) return null;
    if (!value) {
      return (
        <div className="hidden sm:flex sm:w-[200px] shrink-0 flex-col items-center justify-center gap-1 sm:border-l sm:pl-5 border-border text-center">
          <span className="text-xs font-semibold text-text-muted">Pick a day first</span>
          <span className="text-xs text-text-light">Then set the time here.</span>
        </div>
      );
    }

    const h24 = value.getHours();
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const minute = value.getMinutes();
    const handAngleDeg = dialMode === 'hour' ? (hour12 % 12) * 30 : (minute / 60) * 360;

    return (
      <div className={cn('hidden sm:flex shrink-0 flex-col items-center gap-3 sm:border-l sm:pl-5 border-border', coarse ? 'sm:w-[17rem]' : 'sm:w-[200px]')}>
        <div className="flex items-center gap-2">
          <div className="flex items-center p-0.5 bg-surface-hover rounded-lg">
            <button type="button" onClick={() => setDialMode('hour')} aria-label="Change hour" className={segClass(dialMode === 'hour')}>
              {String(hour12).padStart(2, '0')}
            </button>
            <span className="px-0.5 text-sm font-bold text-text-light">:</span>
            <button type="button" onClick={() => setDialMode('minute')} aria-label="Change minutes" className={segClass(dialMode === 'minute')}>
              {String(minute).padStart(2, '0')}
            </button>
          </div>

          <div className="flex p-0.5 bg-surface-hover rounded-lg">
            {(['AM', 'PM'] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p} className={cn(segClass(period === p), 'text-xs font-bold')}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <span className="text-xs font-medium text-text-light">{dialMode === 'hour' ? 'Tap the hour' : 'Tap the minutes'}</span>

        <div className="relative shrink-0" style={{ width: dial.size, height: dial.size }}>
          <div className="absolute inset-0 rounded-full bg-surface-hover/60 border border-border" />
          <div
            className="absolute bg-primary-500 rounded-full pointer-events-none transition-transform duration-300 ease-out"
            style={{
              width: 2,
              height: dial.radius - 6,
              left: dialCenter - 1,
              top: dialCenter - (dial.radius - 6),
              transform: `rotate(${handAngleDeg}deg)`,
              transformOrigin: `1px ${dial.radius - 6}px`,
            }}
          />
          <div className="absolute size-2 rounded-full bg-primary-600 pointer-events-none" style={{ left: dialCenter - 4, top: dialCenter - 4 }} />

          {(dialMode === 'hour' ? HOUR_MARKS : MINUTE_MARKS).map((markValue, i) => {
            const pos = dialMarkPosition(i);
            const isActive = dialMode === 'hour' ? markValue === hour12 : markValue === minute;
            return (
              <button
                key={markValue}
                type="button"
                onClick={() => (dialMode === 'hour' ? selectHour(markValue) : selectMinute(markValue))}
                aria-label={dialMode === 'hour' ? `${markValue} o'clock` : `${markValue} minutes`}
                aria-pressed={isActive}
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 rounded-full text-xs font-semibold transition-colors duration-150 cursor-pointer flex items-center justify-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                  dial.mark,
                  isActive ? 'bg-primary-600 text-white' : 'text-text-secondary hover:bg-surface-active hover:text-text',
                )}
                style={{ left: pos.left, top: pos.top }}
              >
                {dialMode === 'minute' ? String(markValue).padStart(2, '0') : markValue}
              </button>
            );
          })}
        </div>

        {timeError && <p className="text-xs text-danger font-display" role="alert">{timeError}</p>}

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-full h-9 pointer-coarse:h-11 rounded-lg bg-primary-800 hover:bg-primary-900 dark:bg-primary-600 dark:hover:bg-primary-500 text-white text-sm font-display font-semibold tabular-nums transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Set {formatDay(value)}, {formatClock(value)}
        </button>
      </div>
    );
  })();

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
            'w-full flex items-center gap-2 h-10 pointer-coarse:min-h-11 px-3 rounded-md border bg-surface text-sm transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-hover',
            open ? 'border-primary-500' : 'border-border hover:border-border-hover',
            value && 'pr-9 pointer-coarse:pr-11',
            className,
            triggerClassName,
          )}
        >
          <CalendarIcon size={15} className="text-text-light shrink-0" />
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

        {/* Phone: the device's own time control plus one-tap working-day times. */}
        {showTime && (
          <div className={cn('sm:hidden', panel === 'date' && 'hidden')}>
            <TimePanel label="Time" value={value} onChange={changeTime} minAt={minDate ?? null} />
          </div>
        )}

        {dialColumn}
      </div>
    </PickerShell>
  );
}
