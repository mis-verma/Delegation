import { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronRight, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Button } from '../button';
import { CalendarGrid, type DayState } from '../dateTime/CalendarGrid';
import { PickerShell } from '../dateTime/PickerShell';
import { TimePanel } from '../dateTime/TimePanel';
import {
  DEFAULT_DUE_HOUR, DEFAULT_START_HOUR, addDays, formatClock, formatDay, isSameDay, roundUpToQuarter, startOfDay, withClock,
} from '../dateTime/calendarCore';
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
  /** With `showTime`: ask for a time on the last day only (a start day plus a due day and time). */
  endTimeOnly?: boolean;
  /** One day is enough: a single tap sets the due day and no start day is asked for. */
  dueOnly?: boolean;
  /** Earliest moment that can be picked. Earlier days are greyed out and an earlier time is refused. */
  minDate?: Date;
}

const laterOf = (a: Date | null | undefined, b: Date | null | undefined) => {
  if (a && b) return a.getTime() >= b.getTime() ? a : b;
  return a ?? b ?? null;
};

/**
 * Start and due day (and time) in one picker.
 *
 *  - Phones get a bottom sheet with Date and Time tabs, 44px days and one big Done button; from `sm`
 *    up it is a popover with the calendar and the time side by side. Same content, same behaviour.
 *  - Nothing is reported until the range is complete (or just the due day, in `dueOnly`). Tapping a
 *    first day and walking away used to report a start with no end and clear the due date.
 *  - A day picked with a time gets a sensible one (9 AM to start, 6 PM to finish) instead of
 *    midnight, which for today is already in the past.
 *  - With a time to set it never closes by itself: Done does.
 */
export function DateRangePicker({
  value,
  onChange,
  showTime = false,
  placeholder = 'Select date range',
  className = '',
  triggerClassName = '',
  disabled = false,
  placeholderIsValue = false,
  endTimeOnly = false,
  dueOnly = false,
  minDate,
}: DateRangePickerProps) {
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [open, setOpen] = useState(false);
  // What is being picked right now. The parent's `value` only changes once a choice is complete.
  const [draft, setDraft] = useState<DateRangeValue>(value);
  const [viewMonth, setViewMonth] = useState(() => startOfDay(value.from ?? value.to ?? new Date()));
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  // Re-read on every open, so a tab left open past midnight doesn't call yesterday "today".
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [tab, setTab] = useState<'date' | 'time'>('date');
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => { closeTimer.current = null; setOpen(false); }, 260);
  };

  const handleOpenChange = (next: boolean) => {
    if (disabled) return;
    if (next) {
      cancelClose();
      setDraft(value);
      setViewMonth(startOfDay(value.from ?? value.to ?? new Date()));
      setHoverDate(null);
      setToday(startOfDay(new Date()));
      setTab('date');
    }
    setOpen(next);
  };

  // A picked day with a time gets the previous pick's clock time, or a working-day default, and is
  // never earlier than `minDate`.
  const stamp = (day: Date, which: 'from' | 'to', base: Date | null): Date => {
    if (!showTime || (endTimeOnly && which === 'from')) return startOfDay(day);
    let next = base
      ? withClock(day, base.getHours(), base.getMinutes())
      : withClock(day, which === 'from' ? DEFAULT_START_HOUR : DEFAULT_DUE_HOUR, 0);
    if (minDate && next.getTime() < minDate.getTime()) next = roundUpToQuarter(minDate);
    return next;
  };

  const isComplete = (range: DateRangeValue) => (dueOnly ? !!range.to : !!range.from && !!range.to);

  const commit = (next: DateRangeValue) => {
    setDraft(next);
    if (isComplete(next)) onChange(next);
  };

  // With a time to set, a phone moves on to the Time tab. Without one, the picker closes itself a beat
  // after the last day so that day is seen lit up first.
  const afterComplete = () => {
    if (showTime) { if (isPhone) setTab('time'); } else closeSoon();
  };

  const handleDayClick = (day: Date) => {
    if (dueOnly) {
      commit({ from: draft.from, to: stamp(day, 'to', draft.to) });
      afterComplete();
      return;
    }

    const complete = !!draft.from && !!draft.to;
    if (!draft.from || complete) {
      cancelClose();
      commit({ from: stamp(day, 'from', draft.from), to: null });
      return;
    }

    const fromDay = startOfDay(draft.from);
    const picked = day < fromDay
      ? { from: stamp(day, 'from', draft.from), to: stamp(fromDay, 'to', null) }
      : { from: draft.from, to: stamp(day, 'to', draft.to) };
    // Same-day ranges with the clock the wrong way round are made to meet rather than invert.
    if (picked.to && picked.from && picked.to < picked.from) picked.to = picked.from;
    commit(picked);
    afterComplete();
  };

  const pickingEnd = !dueOnly && !!draft.from && !draft.to;
  const previewTo = pickingEnd ? hoverDate : draft.to;

  const getDayState = (day: Date): DayState => {
    const disabledDay = !!minDate && day < startOfDay(minDate);
    const isFrom = isSameDay(day, draft.from);
    const isTo = isSameDay(day, draft.to);
    if (dueOnly) return { disabled: disabledDay, solid: isTo };

    const hasSpan = !!draft.from && !!previewTo && !isSameDay(draft.from, previewTo);
    const solid = isFrom || isTo;
    let inRange = false;
    if (draft.from && previewTo) {
      const [lo, hi] = draft.from <= previewTo ? [draft.from, previewTo] : [previewTo, draft.from];
      inRange = day >= startOfDay(lo) && day <= startOfDay(hi);
    }
    return {
      disabled: disabledDay,
      solid,
      inRange: inRange && !solid,
      // The start drops its right corners and the end its left, so the band reads as one piece.
      roundLeft: inRange && !solid ? false : !(solid && hasSpan && isTo && !isFrom),
      roundRight: inRange && !solid ? false : !(solid && hasSpan && isFrom && !isTo),
    };
  };

  const setTime = (which: 'from' | 'to', next: Date) => {
    const range = { ...draft, [which]: next };
    // Moving the start past a same-day end pulls the end along.
    if (which === 'from' && range.to && range.to < next) range.to = next;
    commit(range);
  };

  const presets: Array<{ label: string; from: Date; to: Date }> = dueOnly
    ? [
        { label: 'Today', from: today, to: today },
        { label: 'Tomorrow', from: addDays(today, 1), to: addDays(today, 1) },
        { label: 'In 3 days', from: addDays(today, 3), to: addDays(today, 3) },
        { label: 'Next week', from: addDays(today, 7), to: addDays(today, 7) },
      ]
    : [
        { label: 'Today', from: today, to: today },
        { label: 'Tomorrow', from: addDays(today, 1), to: addDays(today, 1) },
        { label: 'Next 7 days', from: today, to: addDays(today, 6) },
        { label: 'This month', from: today, to: new Date(today.getFullYear(), today.getMonth() + 1, 0) },
      ];

  const applyPreset = (preset: { from: Date; to: Date }) => {
    cancelClose();
    const to = stamp(preset.to, 'to', draft.to);
    commit({ from: dueOnly ? draft.from : stamp(preset.from, 'from', draft.from), to });
    setViewMonth(startOfDay(preset.to));
    afterComplete();
  };

  const hasValue = !!value.from || !!value.to;
  const clock = (d: Date) => (showTime ? `, ${formatClock(d)}` : '');
  const label = hasValue
    ? [
        value.from && !dueOnly ? formatDay(value.from) + (endTimeOnly ? '' : clock(value.from)) : null,
        value.to ? formatDay(value.to) + clock(value.to) : null,
      ].filter(Boolean).join(' to ')
    : placeholder;

  const complete = isComplete(draft);
  const toMinAt = !endTimeOnly && !dueOnly && draft.from && draft.to && isSameDay(draft.from, draft.to)
    ? laterOf(minDate, draft.from)
    : (minDate ?? null);

  const hint = dueOnly
    ? (draft.to ? 'Due day set' : 'Pick the due day')
    : pickingEnd ? 'Now pick the last day' : complete ? 'Range set' : 'Pick the first day';

  const slots = dueOnly
    ? ([{ key: 'to', label: 'Due', date: draft.to, active: !draft.to }] as const)
    : ([
        { key: 'from', label: 'Start', date: draft.from, active: !pickingEnd },
        { key: 'to', label: 'End', date: draft.to, active: pickingEnd },
      ] as const);

  const dateColumn = (
    <div className="flex flex-col gap-3 w-full sm:w-[19.5rem] min-w-0">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick choices">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            className="h-8 pointer-coarse:h-11 px-3 rounded-full border border-border/70 bg-surface-hover/50 text-xs font-display font-semibold text-text-secondary hover:border-primary-500/40 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* What has been picked and which tap comes next. */}
      <div className={cn('grid items-center gap-2', slots.length === 2 ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-1')}>
        {slots.map((slot, i) => (
          <div key={slot.key} className="contents">
            {i === 1 && <ChevronRight size={14} className="text-text-light" aria-hidden="true" />}
            <div
              className={cn(
                'flex flex-col gap-0.5 px-3 py-1.5 rounded-xl border',
                slot.active ? 'border-primary-500/60 bg-primary-500/5' : 'border-border/60 bg-surface-hover/40',
              )}
            >
              <span className="text-xs font-display font-semibold text-text-muted leading-none">{slot.label}</span>
              <span className={cn('text-sm font-display font-bold leading-tight', slot.date ? 'text-text' : 'text-text-light')}>
                {slot.date ? formatDay(slot.date) : slot.active ? 'Pick a day' : 'None'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <CalendarGrid
        month={viewMonth}
        onMonthChange={setViewMonth}
        getDayState={getDayState}
        onSelect={handleDayClick}
        onHover={setHoverDate}
        today={today}
      />

      <p className="text-xs font-display text-text-muted" role="status">{hint}</p>
    </div>
  );

  const timeColumn = showTime && (
    <div className="flex flex-col gap-4 w-full sm:w-56 min-w-0 sm:border-l sm:border-border/60 sm:pl-4">
      {!endTimeOnly && !dueOnly && (
        <TimePanel label="Start time" value={draft.from} onChange={(d) => setTime('from', d)} minAt={minDate} onTouch={cancelClose} />
      )}
      <TimePanel
        label={endTimeOnly || dueOnly ? 'Due time' : 'End time'}
        value={draft.to}
        onChange={(d) => setTime('to', d)}
        minAt={toMinAt}
        onTouch={cancelClose}
      />
      {/* From sm up the Done button lives here; on a phone it is pinned under the sheet instead. */}
      <Button variant="primary" size="sm" onClick={() => setOpen(false)} disabled={!complete} className="hidden sm:inline-flex mt-auto">
        Done
      </Button>
    </div>
  );

  const phoneTabs = showTime && (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-hover/80 sm:hidden">
      {([
        { key: 'date', label: 'Date', text: draft.to ? formatDay(draft.to) : 'Pick a day' },
        { key: 'time', label: 'Time', text: draft.to ? formatClock(draft.to) : 'Day first' },
      ] as const).map((t) => (
        <button
          key={t.key}
          type="button"
          disabled={t.key === 'time' && !complete}
          aria-pressed={tab === t.key}
          onClick={() => setTab(t.key)}
          className={cn(
            'flex flex-col items-start gap-0.5 min-h-12 px-3 py-1.5 rounded-lg text-left transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-50',
            tab === t.key ? 'bg-surface border border-border' : 'border border-transparent',
          )}
        >
          <span className="text-xs font-display font-semibold text-text-muted leading-none">{t.label}</span>
          <span className={cn('text-sm font-display font-semibold leading-tight tabular-nums', tab === t.key ? 'text-text' : 'text-text-secondary')}>{t.text}</span>
        </button>
      ))}
    </div>
  );

  return (
    <PickerShell
      open={open}
      onOpenChange={handleOpenChange}
      wrapperClassName={className}
      title={dueOnly ? 'Due date' : 'Pick dates'}
      popoverClassName={showTime ? undefined : 'p-3'}
      sheetFooter={showTime && (
        <Button variant="primary" onClick={() => setOpen(false)} disabled={!complete} className="w-full h-11 font-display">
          {complete ? 'Done' : dueOnly ? 'Pick the due day' : pickingEnd ? 'Now pick the last day' : 'Pick the first day'}
        </Button>
      )}
      trigger={
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
      }
      triggerAside={hasValue && !disabled && (
        // A sibling of the trigger, not nested inside it, so it is a real button of its own.
        <button
          type="button"
          aria-label="Clear date range"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 text-text-light bg-surface-hover hover:bg-danger/10 hover:text-danger rounded-full transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          onClick={(e) => {
            e.stopPropagation();
            setDraft({ from: null, to: null });
            onChange({ from: null, to: null });
          }}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      )}
    >
      {phoneTabs}
      {/* Phone shows one tab at a time; from sm up both columns sit side by side. */}
      <div className={cn('sm:grid sm:gap-4', showTime && 'sm:grid-cols-[19.5rem_14rem]')}>
        <div className={cn(showTime && tab === 'time' && 'max-sm:hidden')}>{dateColumn}</div>
        {timeColumn && <div className={cn(tab === 'date' && 'max-sm:hidden')}>{timeColumn}</div>}
      </div>
    </PickerShell>
  );
}
