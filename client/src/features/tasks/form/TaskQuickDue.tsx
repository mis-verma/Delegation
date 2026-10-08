import { useMemo } from 'react';
import type { DateRangeValue } from '../../../components';

const dayAt = (addDays: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays);
};

const OPTIONS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

/**
 * One-tap due days above the full calendar. Sets the due day (the saved time is the end of that
 * day, same as picking it in the calendar) and keeps the start day unless it would land after it.
 */
export const TaskQuickDue = ({ value, onChange }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void }) => {
  // Computed once when the form opens, so the options don't shift under a finger at midnight.
  const options = useMemo(() => OPTIONS.map((o) => ({ label: o.label, date: dayAt(o.days) })), []);

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick due days">
      {options.map(({ label, date }) => {
        const selected = !!value.to && value.to.toDateString() === date.toDateString();
        return (
          <button
            key={label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange({ from: value.from && value.from > date ? null : value.from, to: date })}
            className={`h-8 pointer-coarse:h-11 px-3 rounded-full border text-xs font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] ${
              selected
                ? 'bg-primary-500/10 dark:bg-primary-500/15 border-primary-500/40 text-primary-700 dark:text-primary-300'
                : 'border-border/60 bg-surface text-text-secondary hover:border-primary-400'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
