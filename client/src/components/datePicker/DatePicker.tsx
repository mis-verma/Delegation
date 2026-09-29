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
const DIAL_SIZE = 160;
const DIAL_RADIUS = 64;
const DIAL_CENTER = DIAL_SIZE / 2;

const dialMarkPosition = (index: number) => {
  const angle = (index / 12) * 2 * Math.PI - Math.PI / 2;
  return {
    left: DIAL_CENTER + DIAL_RADIUS * Math.cos(angle),
    top: DIAL_CENTER + DIAL_RADIUS * Math.sin(angle),
  };
};

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
  // Reading a ref's .current during render isn't allowed (it can go stale without triggering a
  // re-render), so the trigger's DOM node is tracked in state via a callback ref instead.
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);

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
        }
        setOpen(next);
      }}
    >
      {/* relative wrapper: the clear control used to be a span[role=button] nested inside the
          trigger <button> — invalid interactive-in-interactive nesting that screen readers can't
          expose correctly. It's now a real sibling <button>, absolutely positioned over the
          trigger's own end padding (reserved below) instead of living inside it. */}
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            ref={setTriggerEl}
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

      {/* A small floating popup, not an inline panel that pushed everything below it down and
          grew the whole dialog with it — same floating-over-content treatment as Combobox. Sized
          to its own content (no forced trigger width) since a calendar+clock has its own natural,
          compact size regardless of how wide the field above it is. */}
      <PopoverContent
        align="start"
        collisionBoundary={triggerEl?.closest('[data-slot="dialog-content"]') ?? undefined}
        collisionPadding={16}
        className="w-auto min-w-0 max-w-[calc(100vw-2rem)] p-4"
      >
        <div className="flex flex-col sm:flex-row sm:gap-5">
          {/* Calendar column */}
          <div className="sm:w-[260px] shrink-0">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {QUICK_PICKS.map((pick) => {
                const target = startOfDay(pick.resolve(today));
                const isActive = isSameDay(value, target);
                return (
                  <button
                    key={pick.label}
                    type="button"
                    onClick={() => selectDay(target)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                      isActive
                        ? 'bg-primary-600 text-white shadow-sm shadow-primary-500/20'
                        : 'bg-surface-hover text-text-secondary hover:bg-surface-active hover:text-text'
                    )}
                  >
                    {pick.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
                aria-label="Previous month"
                className="p-2 rounded-lg border border-border text-text-muted hover:bg-surface-hover hover:text-text transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-text tracking-wide">
                {MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
                className="p-2 rounded-lg border border-border text-text-muted hover:bg-surface-hover hover:text-text transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1.5">
              {WEEKDAY_LABELS.map((w) => (
                <span key={w} className="text-[10px] font-bold text-text-light text-center tracking-wider">
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
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
                      'h-8 w-full flex items-center justify-center text-sm rounded-xl transition-all font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                      (!inMonth || isBeforeMin) ? 'text-text-light/60 cursor-default' : 'text-text-secondary cursor-pointer',
                      isSelected && 'bg-primary-600 text-white font-semibold shadow-sm shadow-primary-500/25 hover:bg-primary-700',
                      isToday && !isSelected && 'text-primary-600 bg-primary-500/10 font-bold',
                      inMonth && !isBeforeMin && !isSelected && 'hover:bg-surface-hover hover:text-text'
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time column — sits beside the calendar at sm+ instead of stacked below it, which is
              what forced this popover past the modal's visible height and needed a scroll. */}
          {showTime && value && (() => {
            const h24 = value.getHours();
            const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
            const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
            const minute = value.getMinutes();

            const handAngleDeg = dialMode === 'hour' ? (hour12 % 12) * 30 : (minute / 60) * 360;

            return (
              <div className="mt-4 pt-4 border-t sm:mt-0 sm:pt-0 sm:border-t-0 sm:border-l sm:pl-5 border-border sm:w-[240px] shrink-0 flex flex-col items-center gap-4">
                <div className="flex flex-col items-center gap-3 w-full">
                  <span className="text-[11px] font-bold text-text-light tracking-wider self-center sm:self-start">Time</span>

                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center p-1 bg-surface-hover rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={() => setDialMode('hour')}
                        className={cn(
                          'px-2 py-1 rounded-md text-sm font-semibold tabular-nums transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                          dialMode === 'hour' ? 'bg-surface text-primary-600 shadow-sm shadow-black/5' : 'text-text-muted hover:text-text hover:bg-surface-active/50',
                        )}
                      >
                        {String(hour12).padStart(2, '0')}
                      </button>
                      <span className="px-1 text-sm font-bold text-text-light">:</span>
                      <button
                        type="button"
                        onClick={() => setDialMode('minute')}
                        className={cn(
                          'px-2 py-1 rounded-md text-sm font-semibold tabular-nums transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                          dialMode === 'minute' ? 'bg-surface text-primary-600 shadow-sm shadow-black/5' : 'text-text-muted hover:text-text hover:bg-surface-active/50',
                        )}
                      >
                        {String(minute).padStart(2, '0')}
                      </button>
                    </div>

                    <div className="flex p-1 bg-surface-hover rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={() => setPeriod('AM')}
                        aria-pressed={period === 'AM'}
                        className={cn(
                          'px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                          period === 'AM' ? 'bg-surface text-primary-600 shadow-sm shadow-black/5' : 'text-text-muted hover:text-text hover:bg-surface-active/50',
                        )}
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        onClick={() => setPeriod('PM')}
                        aria-pressed={period === 'PM'}
                        className={cn(
                          'px-2 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                          period === 'PM' ? 'bg-surface text-primary-600 shadow-sm shadow-black/5' : 'text-text-muted hover:text-text hover:bg-surface-active/50',
                        )}
                      >
                        PM
                      </button>
                    </div>
                  </div>
                </div>

                <div className="relative shrink-0" style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
                  <div className="absolute inset-0 rounded-full bg-surface-hover/60 border border-border shadow-inner" />

                  <div
                    className="absolute bg-primary-500 rounded-full pointer-events-none origin-bottom transition-all duration-300 ease-out"
                    style={{
                      width: 2,
                      height: DIAL_RADIUS - 6,
                      left: DIAL_CENTER - 1,
                      top: DIAL_CENTER - (DIAL_RADIUS - 6),
                      transform: `rotate(${handAngleDeg}deg)`,
                      transformOrigin: `1px ${DIAL_RADIUS - 6}px`,
                    }}
                  />
                  <div className="absolute size-2 rounded-full bg-primary-600 shadow-sm pointer-events-none" style={{ left: DIAL_CENTER - 4, top: DIAL_CENTER - 4 }} />

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
                          'absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center justify-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 hover:scale-110',
                          isActive ? 'bg-primary-600 text-white shadow-sm shadow-primary-500/30' : 'text-text-secondary hover:bg-surface-hover hover:text-text',
                        )}
                        style={{ left: pos.left, top: pos.top }}
                      >
                        {dialMode === 'minute' ? String(markValue).padStart(2, '0') : markValue}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </PopoverContent>
    </Popover>
  );
}
