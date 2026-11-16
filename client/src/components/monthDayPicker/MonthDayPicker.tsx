import { cn } from '@/lib/utils';
import { ordinalDay } from './ordinalDay';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

interface MonthDayPickerProps {
  value: number[];
  onChange: (days: number[]) => void;
  maxSelected: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const MonthDayPicker = ({ value, onChange, maxSelected, disabled, className, 'aria-label': ariaLabel }: MonthDayPickerProps) => {
  const toggle = (day: number) => {
    if (value.includes(day)) return onChange(value.filter((d) => d !== day));
    onChange(value.length >= maxSelected ? [...value.slice(value.length - maxSelected + 1), day] : [...value, day]);
  };

  return (
    <div role="group" aria-label={ariaLabel} className={cn('grid w-full max-w-md grid-cols-7 gap-1.5', className)}>
      {DAYS.map((day) => {
        const selected = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={selected}
            aria-label={`${ordinalDay(day)} of the month`}
            disabled={disabled}
            onClick={() => toggle(day)}
            className={cn(
              'flex h-11 cursor-pointer select-none items-center justify-center rounded-xl border t-meta font-display font-semibold tabular-nums transition-all duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 pointer-fine:h-9',
              selected
                ? 'border-primary-700 bg-primary-700 text-white dark:border-primary-500 dark:bg-primary-500'
                : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text',
            )}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
};
