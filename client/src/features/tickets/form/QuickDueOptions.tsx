import { useMemo } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import type { TicketFields } from './ticketFormSchema';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// End of the working day, the same default the calendar picker gives a day picked with no time.
const DUE_HOUR = 18;

const buildOptions = () => {
  const now = new Date();
  const at = (addDays: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, DUE_HOUR, 0);
  const options: { label: string; date: Date }[] = [];
  // "Today" only while 6 PM is still comfortably ahead; a due time in the past is rejected.
  if (at(0).getTime() > now.getTime() + 30 * 60_000) options.push({ label: 'Today', date: at(0) });
  options.push({ label: 'Tomorrow', date: at(1) }, { label: 'In 3 days', date: at(3) }, { label: 'Next week', date: at(7) });
  return options;
};

/** One-tap due dates above the full calendar, for the common cases. Sets the due day at 6 PM. */
export const QuickDueOptions = ({ control, setValue }: { control: Control<TicketFields>; setValue: UseFormSetValue<TicketFields> }) => {
  const dueDate = useWatch({ control, name: 'dueDate' });
  const dueTime = useWatch({ control, name: 'dueTime' });
  const startDate = useWatch({ control, name: 'startDate' });
  const options = useMemo(() => buildOptions(), []);

  const pick = (date: Date) => {
    const due = toDateStr(date);
    // A start day after the new due day would be an impossible range, so it is dropped.
    if (startDate && startDate > due) setValue('startDate', '');
    setValue('dueDate', due, { shouldValidate: true });
    setValue('dueTime', `${pad2(DUE_HOUR)}:00`, { shouldValidate: true });
  };

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick due dates">
      {options.map(({ label, date }) => {
        const selected = dueDate === toDateStr(date) && dueTime === `${pad2(DUE_HOUR)}:00`;
        return (
          <button
            key={label}
            type="button"
            onClick={() => pick(date)}
            aria-pressed={selected}
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
