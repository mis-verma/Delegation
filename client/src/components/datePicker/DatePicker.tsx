import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';

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
  minDate?: Date;
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const isSameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// No year — matches every other short-date display in the app (TicketCard's dueLabel,
// ChecklistDefinitionCard's formatDate, ...), none of which show one for a near-term date. This
// used to include the year ("Sep 30, 2026 • 2:59 PM"), which was long enough on its own to force
// this chip onto its own line in a row of shorter chips (category/department/priority/assignee).
const formatDate = (d: Date) => `${MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
const formatTime = (d: Date) => {
  const h24 = d.getHours();
  const period = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${hour12}:${String(d.getMinutes()).padStart(2, '0')} ${period}`;
};

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

const buildMonthGrid = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) =>
    new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  );
};

const QUICK_PICKS: { label: string; resolve: (today: Date) => Date }[] = [
  { label: 'Today', resolve: (today) => today },
  { label: 'Tomorrow', resolve: (today) => addDays(today, 1) },
  { label: 'Next week', resolve: (today) => addDays(today, 7) },
  { label: 'Next month', resolve: (today) => addMonths(today, 1) },
];

const HOUR_MARKS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_MARKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const DIAL_SIZE = 148;
const DIAL_RADIUS = 58;
const DIAL_CENTER = DIAL_SIZE / 2;

const dialMarkPosition = (index: number) => {
  const angle = (index / 12) * 2 * Math.PI - Math.PI / 2;
  return {
    left: DIAL_CENTER + DIAL_RADIUS * Math.cos(angle),
    top: DIAL_CENTER + DIAL_RADIUS * Math.sin(angle),
  };
};

const segClass = (on: boolean) => cn(
  'px-2 py-1 rounded-md text-sm font-semibold tabular-nums transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
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
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfDay(value ?? new Date()));
  const [dialMode, setDialMode] = useState<'hour' | 'minute'>('hour');
  // Phones only: date and time are two tabs of one small panel instead of a calendar stacked on
  // top of a clock (~650px tall, more than a modal leaves). From sm up both sit side by side and
  // this is ignored.
  const [panel, setPanel] = useState<'date' | 'time'>('date');

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const earliestDay = minDate ? startOfDay(minDate) : null;

  const selectDay = (day: Date) => {
    const now = new Date();
    const withTime = showTime
      ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), value ? value.getHours() : now.getHours(), value ? value.getMinutes() : now.getMinutes())
      : day;
    onChange(withTime);
    if (!showTime) setOpen(false);
    // Day picked, so the phone panel moves on to the next question.
    else setPanel('time');
  };

  const selectHour = (hour12: number) => {
    if (!value) return;
    const isPM = value.getHours() >= 12;
    const next = new Date(value);
    next.setHours((hour12 % 12) + (isPM ? 12 : 0));
    onChange(next);
    setDialMode('minute');
  };

  const selectMinute = (minute: number) => {
    if (!value) return;
    const next = new Date(value);
    next.setMinutes(minute);
    onChange(next);
  };

  const setPeriod = (period: 'AM' | 'PM') => {
    if (!value) return;
    const h = value.getHours();
    const isPM = h >= 12;
    if ((period === 'PM') === isPM) return;
    const next = new Date(value);
    next.setHours(period === 'PM' ? h + 12 : h - 12);
    onChange(next);
  };

  return (
    <Popover
      open={open}
      // Modal, same as Combobox: this popover is portaled to document.body, outside a parent
      // Dialog's DOM subtree, and every day/hour/minute cell is a real <button> that takes DOM
      // focus on click. A non-modal Popover has no focus trap of its own, so the Dialog's own trap
      // yanks focus straight back the instant a cell is focused — which a non-modal Popover reads
      // as "focus left" and closes on, right as the click lands. `modal` gives it Radix's own
      // dedicated handling for that nested-focus-trap case instead of losing every pick to it.
      modal
      onOpenChange={(next) => {
        if (disabled) return;
        if (next) {
          setViewMonth(startOfDay(value ?? new Date()));
          setDialMode('hour');
          setPanel('date');
        }
        setOpen(next);
      }}
    >
      {/* relative wrapper: the clear control is a real sibling <button>, absolutely positioned
          over the trigger's own end padding, not an interactive element nested inside it. */}
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'w-full flex items-center gap-2 h-10 px-3 rounded-md border bg-surface text-sm transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-hover',
              open ? 'border-primary-500' : 'border-border hover:border-border-hover',
              value && 'pr-9',
              className,
              triggerClassName,
            )}
          >
            <CalendarIcon size={15} className="text-text-light shrink-0" />
            <span className={cn('truncate', value ? 'text-text font-medium' : 'text-text-light font-medium')}>
              {value ? formatDate(value) + (showTime ? ` • ${formatTime(value)}` : '') : placeholder}
            </span>
          </button>
        </PopoverTrigger>
        {value && !disabled && (
          <button
            type="button"
            aria-label="Clear date"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-text-light bg-surface-hover hover:bg-danger/10 hover:text-danger rounded-full transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Floats over the form rather than pushing it down. Bounded by the viewport, not the
          dialog: fenced into the dialog it had nowhere to go but up over the modal's own header.
          Height is capped to the room Radix measures on the chosen side and the panel scrolls
          inside that cap, so a short laptop screen never cuts off the bottom row. */}
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="w-auto min-w-0 max-w-[calc(100vw-1.5rem)] max-h-[min(34rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain custom-scrollbar p-0"
      >
        {showTime && (
          <div className="sm:hidden sticky top-0 z-10 bg-surface p-2 pb-0">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-hover/80">
              {([
                { key: 'date', label: 'Date', text: value ? formatDate(value) : 'Pick a day' },
                { key: 'time', label: 'Time', text: value ? formatTime(value) : 'Day first' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  disabled={tab.key === 'time' && !value}
                  onClick={() => setPanel(tab.key)}
                  aria-pressed={panel === tab.key}
                  className={cn(
                    'flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-lg text-left transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-50',
                    panel === tab.key ? 'bg-surface border border-border' : 'border border-transparent',
                  )}
                >
                  <span className="text-[10px] font-semibold text-text-muted leading-none">{tab.label}</span>
                  <span className={cn('text-sm font-display font-semibold leading-tight tabular-nums', panel === tab.key ? 'text-text' : 'text-text-secondary')}>{tab.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:gap-5 p-3.5 sm:p-4">
          <div className={cn('w-[272px] max-w-full shrink-0 flex flex-col gap-3', showTime && panel === 'time' && 'hidden sm:flex')}>
            {/* One row of four, not a wrapping 3 + 1: the orphaned "Next month" on its own line
                was the first thing that made this panel look unplanned. */}
            <div className="grid grid-cols-4 gap-1">
              {QUICK_PICKS.map((pick) => {
                const target = startOfDay(pick.resolve(today));
                const isActive = isSameDay(value, target);
                return (
                  <button
                    key={pick.label}
                    type="button"
                    onClick={() => selectDay(target)}
                    className={cn(
                      'h-8 px-1 rounded-lg text-[11px] font-display font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'bg-surface-hover text-text-secondary hover:bg-surface-active hover:text-text',
                    )}
                  >
                    {pick.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
                aria-label="Previous month"
                className="flex items-center justify-center size-8 rounded-lg border border-border text-text-muted hover:bg-surface-hover hover:text-text transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-display font-semibold text-text">
                {MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
                className="flex items-center justify-center size-8 rounded-lg border border-border text-text-muted hover:bg-surface-hover hover:text-text transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-7">
                {WEEKDAY_LABELS.map((w) => (
                  <span key={w} className="text-[10px] font-bold text-text-light text-center">
                    {w}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {grid.map((day) => {
                  const inMonth = day.getMonth() === viewMonth.getMonth();
                  const isBeforeMin = !!earliestDay && day < earliestDay;
                  const isSelected = isSameDay(day, value);
                  const isToday = isSameDay(day, today);

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => selectDay(day)}
                      disabled={!inMonth || isBeforeMin}
                      className={cn(
                        'h-9 sm:h-8 w-full flex items-center justify-center text-sm rounded-lg transition-colors duration-150 font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                        (!inMonth || isBeforeMin) ? 'text-text-light/50 cursor-default' : 'text-text-secondary cursor-pointer',
                        isSelected && 'bg-primary-600 text-white font-semibold hover:bg-primary-700',
                        isToday && !isSelected && 'text-primary-600 dark:text-primary-300 bg-primary-500/10 font-bold',
                        inMonth && !isBeforeMin && !isSelected && 'hover:bg-surface-hover hover:text-text',
                      )}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Time: beside the calendar from sm up, its own tab on phones. */}
          {showTime && !value && (
            <div className="hidden sm:flex sm:w-[200px] shrink-0 flex-col items-center justify-center gap-1 sm:border-l sm:pl-5 border-border text-center">
              <span className="text-xs font-semibold text-text-muted">Pick a day first</span>
              <span className="text-[11px] text-text-light">Then set the time here.</span>
            </div>
          )}

          {showTime && value && (() => {
            const h24 = value.getHours();
            const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
            const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
            const minute = value.getMinutes();
            const handAngleDeg = dialMode === 'hour' ? (hour12 % 12) * 30 : (minute / 60) * 360;

            return (
              <div
                className={cn(
                  'sm:w-[200px] shrink-0 flex-col items-center gap-3 sm:border-l sm:pl-5 border-border',
                  panel === 'time' ? 'flex' : 'hidden sm:flex',
                )}
              >
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
                      <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p} className={cn(segClass(period === p), 'text-[11px] font-bold')}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <span className="text-[11px] font-medium text-text-light">
                  {dialMode === 'hour' ? 'Tap the hour' : 'Tap the minutes'}
                </span>

                <div className="relative shrink-0" style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
                  <div className="absolute inset-0 rounded-full bg-surface-hover/60 border border-border" />

                  <div
                    className="absolute bg-primary-500 rounded-full pointer-events-none transition-transform duration-300 ease-out"
                    style={{
                      width: 2,
                      height: DIAL_RADIUS - 6,
                      left: DIAL_CENTER - 1,
                      top: DIAL_CENTER - (DIAL_RADIUS - 6),
                      transform: `rotate(${handAngleDeg}deg)`,
                      transformOrigin: `1px ${DIAL_RADIUS - 6}px`,
                    }}
                  />
                  <div className="absolute size-2 rounded-full bg-primary-600 pointer-events-none" style={{ left: DIAL_CENTER - 4, top: DIAL_CENTER - 4 }} />

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
                          'absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full text-xs font-semibold transition-colors duration-150 cursor-pointer flex items-center justify-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                          isActive ? 'bg-primary-600 text-white' : 'text-text-secondary hover:bg-surface-active hover:text-text',
                        )}
                        style={{ left: pos.left, top: pos.top }}
                      >
                        {dialMode === 'minute' ? String(markValue).padStart(2, '0') : markValue}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full h-9 rounded-lg bg-primary-800 hover:bg-primary-900 dark:bg-primary-600 dark:hover:bg-primary-500 text-white text-sm font-display font-semibold tabular-nums transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  Set {formatDate(value)}, {formatTime(value)}
                </button>
              </div>
            );
          })()}
        </div>
      </PopoverContent>
    </Popover>
  );
}
