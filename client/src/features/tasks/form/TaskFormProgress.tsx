import { useWatch, type Control } from 'react-hook-form';
import { Check } from 'lucide-react';
import type { TaskFields } from '../TaskForm';

/**
 * Footer line for the New delegation form. Only the title is required, so that is the one thing it
 * can block on; once the title is in it lists what is still empty (person, dates) as a gentle nudge,
 * since a delegation with no owner or due day is easy to lose. Its own component so only this line
 * re-renders on each keystroke.
 */
export const TaskFormProgress = ({
  control,
  hasPerson,
  hasDates,
}: {
  control: Control<TaskFields>;
  hasPerson: boolean;
  hasDates: boolean;
}) => {
  const title = useWatch({ control, name: 'title' });

  if (!(title ?? '').trim()) {
    return (
      <p className="text-xs font-medium font-display text-text-muted" role="status">
        Still needed: <span className="text-text-secondary">title</span>
      </p>
    );
  }

  const unset = [!hasPerson && 'person', !hasDates && 'due date'].filter(Boolean).join(', ');
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium font-display text-success" role="status">
      <Check size={14} strokeWidth={2.5} aria-hidden />
      <span>
        Ready to create
        {unset && <span className="font-normal text-text-muted"> · not set yet: {unset}</span>}
      </span>
    </p>
  );
};
