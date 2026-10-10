import { useWatch, type Control } from 'react-hook-form';
import { Check } from 'lucide-react';
import type { TicketFields } from './ticketFormSchema';

/**
 * Footer line that says what is still missing, mirroring buildTicketSchema's rules. It lives in its
 * own component so only this line re-renders on every keystroke, not the whole form.
 */
export const FormProgress = ({ control, requirePerson, showOnPhone }: {
  control: Control<TicketFields>;
  requirePerson: boolean;
  /** A phone only shows the line once Create has been pressed; before that it is noise. */
  showOnPhone: boolean;
}) => {
  const [title, description, mode, categoryId, departmentId, assigneeId, dueDate, dueTime] = useWatch({
    control,
    name: ['title', 'description', 'assignmentMode', 'categoryId', 'departmentId', 'assigneeId', 'dueDate', 'dueTime'],
  });

  const missing: string[] = [];
  if ((title ?? '').trim().length < 5) missing.push('title');
  if ((description ?? '').trim().length < 10) missing.push('description');
  if (mode === 'AUTO') {
    if (!categoryId) missing.push('category');
  } else {
    if (!categoryId && !departmentId) missing.push('department');
    if (requirePerson && !categoryId && !assigneeId) missing.push('person');
    if (!dueDate || !dueTime) missing.push('due date');
  }

  const phoneClass = showOnPhone ? '' : 'max-sm:hidden';
  if (missing.length === 0) {
    return (
      <p className={`flex items-center gap-1.5 t-meta font-medium font-display text-success ${phoneClass}`} role="status">
        <Check size={14} strokeWidth={2.5} /> Ready to create
      </p>
    );
  }
  return (
    <p className={`t-meta font-medium font-display text-text-muted ${phoneClass}`} role="status">
      Still needed: <span className="text-text-secondary">{missing.join(', ')}</span>
    </p>
  );
};
