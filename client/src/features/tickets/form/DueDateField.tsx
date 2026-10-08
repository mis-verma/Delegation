import { useWatch, type Control, type UseFormSetValue, type FieldErrors } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { DateRangePicker, type DateRangeValue } from '../../../components';
import type { TicketFields } from './ticketFormSchema';

interface DueDateFieldProps {
  mode: 'MANUAL' | 'AUTO';
  control: Control<TicketFields>;
  setValue: UseFormSetValue<TicketFields>;
  errors: FieldErrors<TicketFields>;
  categoryTatHours: number | null | undefined;
  /** Drop the visible label, for a caller that shows this as a chip in a row of other chips. */
  hideLabel?: boolean;
  /** Extra classes for the date trigger (e.g. the shared chip trigger style). */
  triggerClassName?: string;
  /**
   * Ask for the due day and time only. A ticket's start day is informational (the clock runs from
   * when it is raised), so by default one tap sets the deadline and any start day is dropped.
   */
  dueOnly?: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toTimeStr = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;


export const DueDateField = ({ mode, control, setValue, errors, categoryTatHours, hideLabel = false, triggerClassName, dueOnly = true }: DueDateFieldProps) => {
  const dueDate = useWatch({ control, name: 'dueDate' });
  const dueTime = useWatch({ control, name: 'dueTime' });
  const startDate = useWatch({ control, name: 'startDate' });

  const combined = dueDate ? new Date(`${dueDate}T${dueTime || '18:00'}`) : null;
  const start = startDate ? new Date(`${startDate}T00:00`) : null;

  // One calendar for the whole span: the first day is when the work starts (optional to think about,
  // but the range needs both ends), the last day is the due day, with a due time. A day picked with no
  // time yet gets the end of the working day rather than midnight, which would already be "late".
  const handleChange = (range: DateRangeValue) => {
    if (dueOnly && range.to) {
      setValue('startDate', '', { shouldValidate: true });
      setValue('dueDate', toDateStr(range.to), { shouldValidate: true });
      setValue('dueTime', toTimeStr(range.to), { shouldValidate: true });
      return;
    }
    if (!range.from && !range.to) {
      setValue('startDate', '', { shouldValidate: true });
      setValue('dueDate', '', { shouldValidate: true });
      setValue('dueTime', '', { shouldValidate: true });
      return;
    }
    setValue('startDate', range.from ? toDateStr(range.from) : '', { shouldValidate: true });
    if (!range.to) {
      // First tap of a new range: the old due day no longer applies until the last day is picked.
      setValue('dueDate', '', { shouldValidate: false });
      setValue('dueTime', '', { shouldValidate: false });
      return;
    }
    const atMidnight = range.to.getHours() === 0 && range.to.getMinutes() === 0;
    const due = atMidnight ? new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 18, 0) : range.to;
    setValue('dueDate', toDateStr(due), { shouldValidate: true });
    setValue('dueTime', toTimeStr(due), { shouldValidate: true });
  };

  return (
    <AnimatePresence>
      {mode === 'MANUAL' ? (
        <motion.div
          key="manual-tat"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
          className="-m-1 flex flex-col gap-1.5 overflow-hidden p-1"
        >
          {!hideLabel && <label className="text-xs font-medium text-text-secondary">{dueOnly ? "Due date and time" : "Start and due day"}</label>}
          <DateRangePicker
            value={{ from: dueOnly ? null : start, to: combined }}
            onChange={handleChange}
            showTime
            endTimeOnly
            dueOnly={dueOnly}
            minDate={new Date()}
            placeholder={hideLabel ? "Add due date" : dueOnly ? "Set a due date and time" : "Select start and due day"}
            triggerClassName={triggerClassName ?? "font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover"}
          />
          {(errors.dueDate?.message || errors.dueTime?.message) && (
            <p className="text-xs text-danger font-display" role="alert">
              {errors.dueDate?.message ?? errors.dueTime?.message}
            </p>
          )}
        </motion.div>
      ) : (
        <motion.div
          key="auto-tat"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
          className="p-3 rounded-md bg-primary-500/5 border border-primary-500/20 text-xs text-primary-700 dark:text-primary-400 font-display flex items-center gap-2.5 overflow-hidden"
          role="status"
        >
          <Sparkles className="w-4 h-4 shrink-0 text-primary-600 dark:text-primary-400" />
          <span>
            Auto-assigned tickets are due within{" "}
            <strong>{categoryTatHours ?? 24} hours</strong>
            {categoryTatHours ? ' (from this category)' : ''}.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};