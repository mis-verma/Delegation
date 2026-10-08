import { PRIORITY_SELECTED_CLASS, PRIORITY_OUTLINE_CLASS } from '../TaskFormPrioritySelector';
import type { Task } from '../../../api/task';

const OPTIONS: { value: Task['priority']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/** The three priorities side by side as one segmented control: one tap, no menu to open. */
export const TaskPrioritySegmented = ({
  value,
  onChange,
  disabled = false,
}: {
  value: Task['priority'];
  onChange: (v: Task['priority']) => void;
  disabled?: boolean;
}) => (
  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-hover/70" role="group" aria-label="Priority">
    {OPTIONS.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        aria-pressed={value === o.value}
        disabled={disabled}
        className={`h-10 pointer-coarse:h-11 px-1 rounded-lg text-xs font-display font-semibold truncate transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-60 [-webkit-tap-highlight-color:transparent] ${
          value === o.value ? `${PRIORITY_SELECTED_CLASS[o.value]} border border-border/60 dark:border-white/[0.08]` : `${PRIORITY_OUTLINE_CLASS[o.value]} border border-transparent`
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);
