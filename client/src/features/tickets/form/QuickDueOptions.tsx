import { useMemo } from 'react';

// End of the working day, the same hour the date picker gives a day picked with no time.
export const DUE_HOUR = 18;

const sameMoment = (a: Date | null, b: Date) => !!a && a.getTime() === b.getTime();

const buildOptions = () => {
  const now = new Date();
  const at = (addDays: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, DUE_HOUR, 0);
  const options: { label: string; date: Date }[] = [];
  // "Today" only while 6 PM is still comfortably ahead; a due time in the past is refused.
  if (at(0).getTime() > now.getTime() + 30 * 60_000) options.push({ label: 'Today', date: at(0) });
  options.push({ label: 'Tomorrow', date: at(1) }, { label: 'In 3 days', date: at(3) }, { label: 'Next week', date: at(7) });
  return options;
};

/** One-tap due times above the date picker, for the common cases. Each one is due at 6 PM. */
export const QuickDueOptions = ({ value, onPick }: { value: Date | null; onPick: (date: Date) => void }) => {
  const options = useMemo(() => buildOptions(), []);

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
            className={`h-8 pointer-coarse:h-11 px-3 rounded-full border text-xs font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] ${
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
