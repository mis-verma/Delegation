import { useWatch, type Control } from 'react-hook-form';
import { Check } from 'lucide-react';
import type { TaskFields } from '../TaskForm';

export const TaskFormProgress = ({
  control,
  hasPerson,
  hasDates,
  needsDepartment,
  attempted,
}: {
  control: Control<TaskFields>;
  hasPerson: boolean;
  hasDates: boolean;
  needsDepartment: boolean;
  attempted: boolean;
}) => {
  const title = useWatch({ control, name: 'title' });
  const departmentId = useWatch({ control, name: 'departmentId' });
  const phoneClass = attempted ? '' : 'max-sm:hidden';

  const missing = [
    !(title ?? '').trim() && 'title',
    needsDepartment && !departmentId && 'department',
  ].filter(Boolean).join(', ');

  if (missing) {
    return (
      <p className={`t-meta font-medium font-display text-text-muted ${phoneClass}`} role="status">
        Still needed: <span className="text-text-secondary">{missing}</span>
      </p>
    );
  }

  const unset = [!hasPerson && 'person', !hasDates && 'due date'].filter(Boolean).join(', ');
  return (
    <p className={`flex items-center gap-1.5 t-meta font-medium font-display text-success ${phoneClass}`} role="status">
      <Check size={14} strokeWidth={2.5} aria-hidden />
      <span>
        Ready to create
        {unset && <span className="font-normal text-text-muted">, not set yet: {unset}</span>}
      </span>
    </p>
  );
};
