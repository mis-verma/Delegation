import { useMemo } from 'react';
import { buildQuickDueOptions } from './buildQuickDueOptions';

const sameMoment = (a: Date | null, b: Date) => !!a && a.getTime() === b.getTime();

export const QuickDueOptions = ({ value, onPick }: { value: Date | null; onPick: (date: Date) => void }) => {
  const options = useMemo(() => buildQuickDueOptions(), []);

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Quick due dates">
      {options.map(({ label, date }) => {
        const selected = sameMoment(value, date);
        return (
          <button
            key={label}
            type="button"
            onClick={() => onPick(date)}
            aria-pressed={selected}
            className={`h-8 pointer-coarse:h-11 px-3 rounded-full border t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] ${
              selected
                ? 'border-text-secondary/60 bg-surface-active text-text'
                : 'border-border/60 bg-surface text-text-secondary hover:border-border-hover hover:text-text'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
