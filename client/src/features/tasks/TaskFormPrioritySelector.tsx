import { FIELD_LABEL_CLASS, FIELD_CARD_CLASS } from './taskFormFieldStyles';
import type { Task } from '../../api/task';

const PRIORITIES: { value: Task['priority']; label: string; short: string }[] = [
  { value: 'low', label: 'Low', short: 'L' },
  { value: 'medium', label: 'Medium', short: 'M' },
  { value: 'high', label: 'High', short: 'H' },
];

// Every chip's border/text always carries its own priority color (not just when selected) — same
// outline-chip language as the Todo list's priority badge, so the two read as one consistent
// system. Built from theme tokens only (no manual `dark:` overrides) so it adapts automatically
// with the app's data-theme toggle.
const PRIORITY_OUTLINE_CLASS: Record<Task['priority'], string> = {
  low: 'border-border text-text-secondary',
  medium: 'border-warning/50 text-warning',
  high: 'border-danger/50 text-danger',
};

// Exported so TaskDetail.tsx's PriorityValuePicker (a differently-shaped "value pill" rather than
// this selector's chip row) can use the exact same colors — one source of truth for what each
// priority's "selected/active" look is, everywhere it appears.
// eslint-disable-next-line react-refresh/only-export-components
export const PRIORITY_SELECTED_CLASS: Record<Task['priority'], string> = {
  low: 'bg-surface-hover border-border-hover text-text',
  medium: 'bg-warning/10 border-warning text-warning',
  high: 'bg-danger/10 border-danger text-danger',
};

interface TaskFormPrioritySelectorProps {
  value: Task['priority'];
  onChange: (value: Task['priority']) => void;
  disabled?: boolean;
  /** Suppress the built-in "Priority Level" label — for callers that already provide their own
   *  label next to this field (e.g. an icon-led row layout). */
  hideLabel?: boolean;
}

export const TaskFormPrioritySelector = ({ value, onChange, disabled = false, hideLabel = false }: TaskFormPrioritySelectorProps) => (
  <div className={`group/field @container flex flex-col gap-1.5 ${FIELD_CARD_CLASS}`}>
    {/* "Priority", sentence case — matches every other field label in the form ("Delegation
        title", "Timeline", "Department", "Labels"). This was the only Title Case one. */}
    {!hideLabel && (
      <label className={FIELD_LABEL_CLASS}>
        Priority
      </label>
    )}
    <div className="flex flex-wrap gap-1.5">
      {PRIORITIES.map((p) => {
        const isSelected = value === p.value;

        return (
          <button
            key={p.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(p.value)}
            disabled={disabled}
            className={`relative flex items-center justify-center gap-1.5 h-8 px-3.5 text-xs font-semibold rounded-full border bg-surface transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-60 ${
              isSelected ? PRIORITY_SELECTED_CLASS[p.value] : `${PRIORITY_OUTLINE_CLASS[p.value]} hover:border-border-hover`
            }`}
          >
            <span className="@sm:hidden">{p.short}</span>
            <span className="hidden @sm:inline truncate">{p.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);