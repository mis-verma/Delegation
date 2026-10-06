import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Button } from '../button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DateRangeValue {
  from: Date | null;
  to: Date | null;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  showTime?: boolean;
  placeholder?: string;
  className?: string;
  /** Extra classes merged onto the trigger button itself — className above only sizes the
   *  outer wrapper. For call sites (e.g. a pill-shaped toolbar) that need to override the
   *  trigger's own shape/height rather than just its width. */
  triggerClassName?: string;
  disabled?: boolean;
  /** Styles the placeholder like a real selected value (solid text, not muted) — for callers
   *  where the placeholder itself is a meaningful default (e.g. "All time" in a filter bar next
   *  to Combobox filters whose own "All X" option renders the same way), not a true empty
   *  "nothing chosen yet" state like a form's "Select a date range". Off by default. */
  placeholderIsValue?: boolean;
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const isSameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// No year — same as DatePicker.tsx's identical fix, for the identical reason: this is what made
// the trigger chip long enough to force itself onto its own line next to shorter chips.
const formatDate = (d: Date) => `${MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
const formatTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

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

// Opens as a small popup under the trigger, the same compact calendar as the "Created on" filter and
// DatePicker, not a full dialog: quick shortcuts on top, one month, and it closes itself a beat after
// the last day is picked. On a phone it is the same popup (it is 19.5rem wide and never wider than the
// screen) with 44px days, so it is thumb-sized without turning into a page-covering sheet. `modal` is
// the same nested-in-a-dialog fix DatePicker documents: a non-modal popover inside a form dialog loses
// every pick to the dialog's own focus trap.
export function DateRangePicker({
  value,
  onChange,
  showTime = false,
  placeholder = 'Select date range',
  className = '',
  triggerClassName = '',
  disabled = false,
  placeholderIsValue = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfDay(value.from ?? new Date()));
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [today] = useState(() => startOfDay(new Date()));
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const previewTo = value.from && !value.to ? hoverDate : value.to;

  const isInRange = (d: Date) => {
    if (!value.from || !previewTo) return false;
    const [lo, hi] = value.from <= previewTo ? [value.from, previewTo] : [previewTo, value.from];
    return d >= startOfDay(lo) && d <= startOfDay(hi);
  };

  // With no times to set, a finished range closes the popup after a short beat, so the last day is
  // seen lit up before it goes. With times, the person still has to set them and press Done.
  const closeSoon = () => {
    if (showTime) return;
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 260);
  };

  const handleDayClick = (day: Date) => {
    const withTime = (base: Date | null, d: Date) =>
      base && showTime ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), base.getHours(), base.getMinutes()) : d;

    if (!value.from || (value.from && value.to)) {
      onChange({ from: withTime(value.from, day), to: null });
      return;
    }

    if (day < value.from) {
      onChange({ from: withTime(value.from, day), to: value.from });
    } else {
      onChange({ from: value.from, to: withTime(value.to, day) });
    }
    closeSoon();
  };

  // Which tap comes next — drives the Start/End readout and the hint at the bottom.
  const pickingEnd = !!value.from && !value.to;

  const setTime = (which: 'from' | 'to', hhmm: string) => {
    const base = value[which];
    if (!base) return;
    const [h, m] = hhmm.split(':').map(Number);
    onChange({ ...value, [which]: new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m) });
  };

  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const presets: Array<{ label: string; from: Date; to: Date }> = [
    { label: 'Today', from: today, to: today },
    { label: 'Tomorrow', from: addDays(today, 1), to: addDays(today, 1) },
    { label: 'Next 7 days', from: today, to: addDays(today, 6) },
    { label: 'This month', from: today, to: new Date(today.getFullYear(), today.getMonth() + 1, 0) },
  ];

  // A task created without an explicit start date (e.g. via Smart Add, which only ever sets a
  // due date) has `from: null, to: <dueDate>` — gating everything on `from` alone made the picker
  // show the empty placeholder even though a due date was in fact set.
  const hasValue = !!value.from || !!value.to;
  const label = hasValue
    ? [
        value.from ? formatDate(value.from) + (showTime ? ` ${formatTime(value.from)}` : '') : null,
        value.to ? formatDate(value.to) + (showTime ? ` ${formatTime(value.to)}` : '') : null,
      ]
        .filter(Boolean)
        .join(' to ')
    : placeholder;

  return (
    <Popover
      open={open}
      modal
      onOpenChange={(next) => {
        if (disabled) return;
        if (next) {
          if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
          setViewMonth(startOfDay(value.from ?? value.to ?? new Date()));
          setHoverDate(null);
        }
        setOpen(next);
      }}
    >
      {/* relative wrapper: the clear control is a real sibling <button>, absolutely positioned over the
          trigger's end padding, not an interactive element nested inside it. */}
      <div className={cn('relative', className)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex items-center gap-2.5 w-full h-11 px-4 rounded-xl border bg-surface text-sm transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-hover',
              open ? 'border-primary-500' : 'border-border hover:border-border-hover',
              hasValue && !disabled && 'pr-10 pointer-coarse:pr-12',
              triggerClassName,
            )}
          >
            <CalendarIcon size={18} className="text-text-light shrink-0" />
            <span className={cn('truncate font-display', (hasValue || placeholderIsValue) ? 'text-text font-medium' : 'text-text-muted font-medium')}>
              {label}
            </span>
          </button>
        </PopoverTrigger>
        {hasValue && !disabled && (
          <button
            type="button"
            aria-label="Clear date range"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 text-text-light bg-surface-hover hover:bg-danger/10 hover:text-danger rounded-full transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: null, to: null });
            }}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="w-[19.5rem] max-w-[calc(100vw-1.5rem)] max-h-[min(34rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain custom-scrollbar p-3 flex flex-col gap-3"
      >
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick ranges">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onChange({ from: preset.from, to: preset.to });
                closeSoon();
              }}
              className="h-8 pointer-coarse:h-11 px-2.5 rounded-full border border-border/70 bg-surface-hover/50 text-xs font-display font-semibold text-text-secondary hover:border-primary-500/40 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Start and End: says what has been picked and which tap comes next. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {([
            { key: 'from', label: 'Start', date: value.from, active: !pickingEnd },
            { key: 'to', label: 'End', date: value.to, active: pickingEnd },
          ] as const).map((slot, i) => (
            <Fragment key={slot.key}>
              {i === 1 && <ChevronRight size={14} className="text-text-light" aria-hidden="true" />}
              <div
                className={cn(
                  'flex flex-col gap-0.5 px-3 py-1.5 rounded-xl border',
                  slot.active ? 'border-primary-500/60 bg-primary-500/5' : 'border-border/60 bg-surface-hover/40',
                )}
              >
                <span className="text-xs font-display font-semibold text-text-muted leading-none">{slot.label}</span>
                <span className={cn('text-sm font-display font-bold leading-tight', slot.date ? 'text-text' : 'text-text-light')}>
                  {slot.date ? formatDate(slot.date) : slot.active ? 'Pick a day' : 'None'}
                </span>
              </div>
            </Fragment>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            aria-label="Previous month"
            className="flex items-center justify-center size-8 pointer-coarse:size-11 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-display font-bold text-text tracking-tight">
            {MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </span>
          <button
            type="button"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            aria-label="Next month"
            className="flex items-center justify-center size-8 pointer-coarse:size-11 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-1" onMouseLeave={() => setHoverDate(null)}>
          <div className="grid grid-cols-7 text-center">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="py-1 text-xs font-display font-semibold text-text-muted">{w}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {grid.map((day) => {
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const isFrom = isSameDay(day, value.from);
              const isTo = isSameDay(day, value.to);
              const inRange = isInRange(day) && !isFrom && !isTo;

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => setHoverDate(day)}
                  disabled={!inMonth}
                  className={cn(
                    'h-9 pointer-coarse:h-11 text-sm font-display tabular-nums rounded-lg transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]',
                    !inMonth ? 'text-text-light/40 cursor-default' : 'text-text cursor-pointer',
                    (isFrom || isTo) && 'bg-primary-700 text-white font-semibold hover:bg-primary-800 dark:bg-primary-600',
                    inRange && 'bg-primary-500/15 text-text',
                    inMonth && !isFrom && !isTo && !inRange && 'hover:bg-surface-hover',
                    !isFrom && !isTo && isSameDay(day, today) && 'ring-1 ring-primary-500/50',
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {showTime && value.from && (
          <div className="flex items-center gap-3 pt-3 border-t border-border/60">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs font-display font-semibold text-text-muted">Start time</label>
              <input
                type="time"
                value={formatTime(value.from)}
                onChange={(e) => setTime('from', e.target.value)}
                className="w-full h-10 pointer-coarse:h-11 rounded-md border border-border bg-surface px-3 text-base sm:text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:border-primary-500"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs font-display font-semibold text-text-muted">End time</label>
              <input
                type="time"
                value={value.to ? formatTime(value.to) : ''}
                disabled={!value.to}
                onChange={(e) => setTime('to', e.target.value)}
                className="w-full h-10 pointer-coarse:h-11 rounded-md border border-border bg-surface px-3 text-base sm:text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:border-primary-500 disabled:bg-surface-hover disabled:text-text-light disabled:cursor-not-allowed"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          <p className="text-xs font-display text-text-muted">
            {pickingEnd ? 'Now pick the last day' : value.from && value.to ? 'Range set' : 'Pick the first day'}
          </p>
          {showTime && (
            <Button variant="primary" size="sm" onClick={() => setOpen(false)} disabled={!value.from || !value.to}>
              Done
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
