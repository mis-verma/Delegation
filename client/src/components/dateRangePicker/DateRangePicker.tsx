import { Fragment, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Button } from '../button';
import { Modal } from '../modal';
import { useMediaQuery } from '../../lib/useMediaQuery';

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

const formatDate = (d: Date) => `${MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
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

// Opens as an actual modal dialog (same Modal/Dialog primitive every other screen in the app
// uses) rather than a trigger-anchored floating popover — a hand-rolled popover has to solve its
// own clipping/z-index/outside-click/reposition-on-scroll problems, all of which the app's Dialog
// already solves correctly. Simpler, and behaves exactly like the rest of the app's modals.
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
  // Phones: the sheet closes itself on the second (end) tap instead of waiting on Apply — unless
  // there are times to set, which still need a Done. Same `sm` breakpoint the sheet layout uses.
  const isPhone = useMediaQuery('(max-width: 639px)');
  const autoClose = isPhone && !showTime;
  const [viewMonth, setViewMonth] = useState(() => startOfDay(value.from ?? new Date()));
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const previewTo = value.from && !value.to ? hoverDate : value.to;

  const isInRange = (d: Date) => {
    if (!value.from || !previewTo) return false;
    const [lo, hi] = value.from <= previewTo ? [value.from, previewTo] : [previewTo, value.from];
    return d >= startOfDay(lo) && d <= startOfDay(hi);
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
    if (autoClose) setOpen(false);
  };

  // Which tap comes next — drives the Start/End readout at the top of the sheet.
  const pickingEnd = !!value.from && !value.to;

  const setTime = (which: 'from' | 'to', hhmm: string) => {
    const base = value[which];
    if (!base) return;
    const [h, m] = hhmm.split(':').map(Number);
    onChange({ ...value, [which]: new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m) });
  };

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
        .join(' – ')
    : placeholder;

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2.5 w-full h-11 px-4 rounded-xl border bg-surface text-sm transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-hover",
          "border-border hover:border-border-hover",
          triggerClassName
        )}
      >
        <CalendarIcon size={18} className="text-text-light shrink-0" />
        <span className={cn("truncate", (hasValue || placeholderIsValue) ? 'text-text font-medium' : 'text-text-muted font-medium')}>
          {label}
        </span>
        {hasValue && !disabled && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear date range"
            className="ml-auto p-1.5 text-text-light bg-surface-hover hover:bg-danger/10 hover:text-danger rounded-full transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: null, to: null });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onChange({ from: null, to: null });
              }
            }}
          >
            <X size={14} strokeWidth={2.5} />
          </span>
        )}
      </button>

      {/* modal={false} — same reason as DatePicker: this can open from inside another Modal
          (e.g. a report/export form), and two nested modal Dialogs fighting over the body
          scroll-lock is what leaves the outer form unresponsive after picking a range. */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        modal={false}
        icon={<CalendarIcon className="w-5 h-5" />}
        title="Select date range"
        size="sm"
        footer={
          autoClose ? undefined : (
            <Button
              variant="primary"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setOpen(false)}
              disabled={!value.from || !value.to}
            >
              Apply Selection
            </Button>
          )
        }
      >
        {/* Start → End readout: says what's been picked and which tap comes next. Without it,
            nothing said a range takes two taps, so a single tap looked like it had done nothing. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {([
            { key: 'from', label: 'Start', date: value.from, active: !pickingEnd },
            { key: 'to', label: 'End', date: value.to, active: pickingEnd },
          ] as const).map((slot, i) => (
            <Fragment key={slot.key}>
              {i === 1 && <ChevronRight size={14} className="text-text-light" aria-hidden="true" />}
              <div
                className={cn(
                  'flex flex-col gap-0.5 px-3 py-2 rounded-xl border',
                  slot.active ? 'border-primary-500/60 bg-primary-500/5' : 'border-border/60 bg-surface-hover/40',
                )}
              >
                <span className="text-[10px] font-semibold text-text-muted leading-none">{slot.label}</span>
                <span className={cn('text-sm font-display font-bold leading-tight', slot.date ? 'text-text' : 'text-text-light')}>
                  {slot.date ? formatDate(slot.date) : slot.active ? 'Pick a day' : '—'}
                </span>
              </div>
            </Fragment>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            aria-label="Previous month"
            className="w-8 h-8 rounded-lg border border-border text-text-muted hover:bg-surface-hover hover:text-text flex items-center justify-center transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-display font-bold text-text">
            {MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </span>
          <button
            type="button"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            aria-label="Next month"
            className="w-8 h-8 rounded-lg border border-border text-text-muted hover:bg-surface-hover hover:text-text flex items-center justify-center transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Days Grid Header */}
        <div className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((w) => (
            <span key={w} className="text-[10px] font-bold text-text-light text-center">
              {w}
            </span>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-1 gap-x-1">
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
                  // h-10 text-sm on phones — thumb-sized; desktop keeps the denser h-9 text-xs.
                  'h-10 sm:h-9 text-sm sm:text-xs rounded-lg transition-colors font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]',
                  !inMonth ? 'text-text-light/40 cursor-default' : 'text-text-secondary cursor-pointer',
                  (isFrom || isTo) && 'bg-primary-700 text-white shadow-sm hover:bg-primary-800',
                  inRange && 'bg-primary-500/15 text-primary-700',
                  inMonth && !isFrom && !isTo && !inRange && 'hover:bg-surface-hover hover:text-primary-700'
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>

        {/* Time Selection */}
        {showTime && value.from && (
          <div className="flex items-center gap-4 pt-4 border-t border-border/60">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-text-muted">
                Start Time
              </label>
              <input
                type="time"
                value={formatTime(value.from)}
                onChange={(e) => setTime('from', e.target.value)}
                className="w-full h-10 rounded-md border border-border px-3 text-base sm:text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:border-primary-500"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-text-muted">
                End Time
              </label>
              <input
                type="time"
                value={value.to ? formatTime(value.to) : ''}
                disabled={!value.to}
                onChange={(e) => setTime('to', e.target.value)}
                className="w-full h-10 rounded-md border border-border px-3 text-base sm:text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:border-primary-500 disabled:bg-surface-hover disabled:text-text-light disabled:cursor-not-allowed"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
