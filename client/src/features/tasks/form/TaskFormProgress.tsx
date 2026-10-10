import { useWatch, type Control } from 'react-hook-form';
import { Check } from 'lucide-react';
import type { TaskFields } from '../TaskForm';

/**
 * Footer line for the New delegation form. Before the required fields are in it says what is still
 * needed; after that it lists what is still empty (person, due date) as a gentle nudge, since a
 * delegation with no owner or due day is easy to lose. Its own component so only this line
 * re-renders on each keystroke. On a phone it stays out of the way until the first Create tap.
 */
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
  /** Department is required for this person (front-line staff send work to a department). */
  needsDepartment: boolean;
  /** True once Create or Save as draft was tapped. */
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
