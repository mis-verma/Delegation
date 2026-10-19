import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  MONTH_LABELS, WEEKDAY_LABELS, addDays, buildMonthGrid, dayKey, fullDayLabel, isSameDay, shiftMonth, startOfDay,
} from './calendarCore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DayState {
  disabled?: boolean;
  solid?: boolean;
  inRange?: boolean;
  roundLeft?: boolean;
  roundRight?: boolean;
}

interface CalendarGridProps {
  month: Date;
  onMonthChange: (month: Date) => void;
  getDayState: (day: Date) => DayState;
  onSelect: (day: Date) => void;
  onHover?: (day: Date | null) => void;
  today: Date;
}

const navButton =
  'flex items-center justify-center size-9 pointer-coarse:size-11 rounded-full bg-surface-hover/70 text-text-muted hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]';

export const CalendarGrid = ({ month, onMonthChange, getDayState, onSelect, onHover, today }: CalendarGridProps) => {
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const [jumpYear, setJumpYear] = useState(month.getFullYear());
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<Date | null>(null);

  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const monthIndex = month.getMonth();

  const tabStop = useMemo(() => {
    const inMonth = grid.filter((d) => d.getMonth() === monthIndex);
    return (
      inMonth.find((d) => getDayState(d).solid && !getDayState(d).disabled) ??
      inMonth.find((d) => isSameDay(d, today) && !getDayState(d).disabled) ??
      inMonth.find((d) => !getDayState(d).disabled) ??
      null
    );
  }, [grid, monthIndex, today, getDayState]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(target)}"]`)?.focus();
  }, [month]);

  const moveFocus = (from: Date, delta: number) => {
    const target = addDays(from, delta);
    if (target.getMonth() !== monthIndex || target.getFullYear() !== month.getFullYear()) {
      pendingFocus.current = target;
      onMonthChange(new Date(target.getFullYear(), target.getMonth(), 1));
      return;
    }
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(target)}"]`)?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, day: Date) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    moveFocus(day, step);
  };

  const openMonthJump = () => {
    setJumpYear(month.getFullYear());
    setMode('months');
  };

  return (
    <div className="flex flex-col gap-2" onMouseLeave={() => onHover?.(null)}>
      <div className="flex items-center justify-between gap-1">
        {mode === 'days' ? (
          <button type="button" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Previous month" className={navButton}>
            <ChevronLeft size={17} />
          </button>
        ) : (
          <button type="button" onClick={() => setJumpYear((y) => y - 1)} aria-label="Previous year" className={navButton}>
            <ChevronLeft size={17} />
          </button>
        )}

        <button
          type="button"
          onClick={() => (mode === 'days' ? openMonthJump() : setMode('days'))}
          aria-expanded={mode === 'months'}
          aria-label={mode === 'days' ? `${MONTH_LABELS[monthIndex]} ${month.getFullYear()}, choose month and year` : `${jumpYear}, back to days`}
          className="inline-flex items-center gap-1 h-9 pointer-coarse:h-11 px-3 rounded-full text-sm font-display font-bold text-text tracking-tight hover:bg-primary-500/10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors [-webkit-tap-highlight-color:transparent]"
        >
          {mode === 'days' ? `${MONTH_LABELS[monthIndex]} ${month.getFullYear()}` : jumpYear}
          <ChevronDown size={14} strokeWidth={2.5} className={cn('text-text-light transition-transform duration-200', mode === 'months' && 'rotate-180')} />
        </button>

        {mode === 'days' ? (
          <button type="button" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Next month" className={navButton}>
            <ChevronRight size={17} />
          </button>
        ) : (
          <button type="button" onClick={() => setJumpYear((y) => y + 1)} aria-label="Next year" className={navButton}>
            <ChevronRight size={17} />
          </button>
        )}
      </div>

      {mode === 'months' ? (
        <div className="grid grid-cols-3 gap-1.5 py-1">
          {MONTH_LABELS.map((name, i) => {
            const isCurrent = i === monthIndex && jumpYear === month.getFullYear();
            return (
              <button
                key={name}
                type="button"
                aria-pressed={isCurrent}
                onClick={() => { onMonthChange(new Date(jumpYear, i, 1)); setMode('days'); }}
                className={cn(
                  'h-11 rounded-lg text-sm font-display font-semibold cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors [-webkit-tap-highlight-color:transparent]',
                  isCurrent ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white dark:from-primary-400 dark:to-primary-600' : 'text-text-secondary hover:bg-primary-500/10',
                )}
              >
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-7 text-center" aria-hidden="true">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="py-1 text-xs font-display font-semibold text-text-muted">{w}</span>
            ))}
          </div>

          <div ref={gridRef} className="grid grid-cols-7 gap-y-0.5" role="group" aria-label={`${MONTH_LABELS[monthIndex]} ${month.getFullYear()}`}>
            {grid.map((day) => {
              if (day.getMonth() !== monthIndex) return <span key={dayKey(day)} aria-hidden="true" />;
              const state = getDayState(day);
              const { disabled = false, solid = false, inRange = false, roundLeft = true, roundRight = true } = state;
              const isToday = isSameDay(day, startOfDay(today));
              const isTabStop = !!tabStop && isSameDay(day, tabStop);

              return (
                <button
                  key={dayKey(day)}
                  type="button"
                  data-day={dayKey(day)}
                  tabIndex={isTabStop ? 0 : -1}
                  disabled={disabled}
                  aria-label={fullDayLabel(day)}
                  aria-pressed={solid}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => onSelect(day)}
                  onMouseEnter={() => onHover?.(day)}
                  onKeyDown={(e) => handleKeyDown(e, day)}
                  className={cn(
                    'h-10 pointer-coarse:h-11 w-full text-sm font-display font-medium tabular-nums transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:z-10 [-webkit-tap-highlight-color:transparent]',
                    roundLeft ? 'rounded-l-lg' : 'rounded-l-none',
                    roundRight ? 'rounded-r-lg' : 'rounded-r-none',
                    disabled ? 'text-text-light/40 cursor-not-allowed' : 'cursor-pointer',
                    solid && 'bg-gradient-to-br from-primary-500 to-primary-700 text-white font-semibold hover:brightness-110 dark:from-primary-400 dark:to-primary-600',
                    inRange && !solid && 'bg-primary-500/12 dark:bg-primary-400/15 text-text',
                    !solid && !inRange && !disabled && 'text-text hover:bg-primary-500/10',
                    isToday && !solid && 'font-bold text-primary-700 dark:text-primary-300 ring-1 ring-inset ring-primary-500/50',
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
