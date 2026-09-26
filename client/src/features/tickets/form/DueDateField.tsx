import { useWatch, type Control, type UseFormSetValue, type FieldErrors } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { DatePicker } from '../../../components';
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
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toTimeStr = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;


export const DueDateField = ({ mode, control, setValue, errors, categoryTatHours, hideLabel = false, triggerClassName }: DueDateFieldProps) => {
  const dueDate = useWatch({ control, name: 'dueDate' });
  const dueTime = useWatch({ control, name: 'dueTime' });

  const combined = dueDate ? new Date(`${dueDate}T${dueTime || '09:00'}`) : null;

  const handleChange = (date: Date | null) => {
    if (!date) {
      setValue('dueDate', '', { shouldValidate: true });
      setValue('dueTime', '', { shouldValidate: true });
      return;
    }
    setValue('dueDate', toDateStr(date), { shouldValidate: true });
    setValue('dueTime', toTimeStr(date), { shouldValidate: true });
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
          className="flex flex-col gap-1.5 overflow-hidden"
        >
          {!hideLabel && <label className="text-xs font-medium text-text-secondary">Due date & time</label>}
          <DatePicker
            value={combined}
            onChange={handleChange}
            showTime
            minDate={new Date()}
            placeholder={hideLabel ? "Add due date" : "Select a due date"}
            className={triggerClassName ? `${triggerClassName} ${combined ? 'pr-10' : ''}` : "font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover"}
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
            Auto-assigned tickets are given a default TAT of{' '}
            <strong>{categoryTatHours ?? 24} hours</strong>
            {categoryTatHours ? ' (from this category)' : ''}.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};