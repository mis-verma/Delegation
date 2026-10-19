import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'short' }));

const STEP_BUTTON =
  'flex items-center justify-center size-11 sm:size-9 shrink-0 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';

interface CalendarMonthPickerProps {
  label: string;
  year: number;
  month: number;
  onPick: (year: number, month: number) => void;
}

export const CalendarMonthPicker = ({ label, year, month, onPick }: CalendarMonthPickerProps) => {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const todayYear = new Date().getFullYear();
  const todayMonth = new Date().getMonth();

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setPickerYear(year);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-live="polite"
          aria-label={`${label}. Choose another month`}
          className="flex min-h-11 sm:min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-lg sm:text-xl font-display font-bold text-text tabular-nums tracking-tight sm:min-w-44 hover:bg-surface-hover transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <span className="truncate">{label}</span>
          <ChevronDown size={16} strokeWidth={2.5} aria-hidden className={cn('shrink-0 text-text-light transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={8} className="w-72 max-w-[calc(100vw-2rem)] p-3">
        <div className="flex items-center justify-between gap-2 pb-2">
          <button type="button" onClick={() => setPickerYear((y) => y - 1)} aria-label="Previous year" className={STEP_BUTTON}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <span className="text-sm font-display font-bold text-text tabular-nums">{pickerYear}</span>
          <button type="button" onClick={() => setPickerYear((y) => y + 1)} aria-label="Next year" className={STEP_BUTTON}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((name, i) => {
            const selected = pickerYear === year && i === month;
            const isNow = pickerYear === todayYear && i === todayMonth;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onPick(pickerYear, i);
                  setOpen(false);
                }}
                className={cn(
                  'h-11 sm:h-9 rounded-lg border text-sm font-display font-semibold transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  selected
                    ? 'border-transparent bg-primary-700 text-white dark:bg-primary-400 dark:text-primary-950'
                    : isNow
                      ? 'border-primary-500/40 text-primary-700 dark:text-primary-300 hover:bg-primary-500/10'
                      : 'border-border/60 text-text-secondary hover:bg-surface-hover',
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
