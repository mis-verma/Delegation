import { FIELD_LABEL_CLASS, FIELD_CARD_CLASS } from './taskFormFieldStyles';
import type { Task } from '../../api/task';

const PRIORITIES: { value: Task['priority']; label: string; short: string }[] = [
  { value: 'low', label: 'Low', short: 'L' },
  { value: 'medium', label: 'Medium', short: 'M' },
  { value: 'high', label: 'High', short: 'H' },
];

// Flat tag-pill treatment, same reference as the Create Ticket modal's identical selector: a soft
// tint fill communicates the pick, not a 2px outlined circle. Unselected stays plain muted text
// with no fill, so the one that's actually chosen is the only thing that visually pops.
// eslint-disable-next-line react-refresh/only-export-components
export const PRIORITY_OUTLINE_CLASS: Record<Task['priority'], string> = {
  low: 'text-text-muted hover:bg-surface-hover',
  medium: 'text-warning/70 hover:bg-warning/5',
  high: 'text-danger/70 hover:bg-danger/5',
};

// Exported so TaskDetail.tsx's PriorityValuePicker (a differently-shaped "value pill" rather than
// this selector's chip row) can use the exact same colors — one source of truth for what each
// priority's "selected/active" look is, everywhere it appears. Changing it here also changes that
// picker's fill to the same flat tint.
// eslint-disable-next-line react-refresh/only-export-components
export const PRIORITY_SELECTED_CLASS: Record<Task['priority'], string> = {
  low: 'bg-surface-active text-text-secondary',
  medium: 'bg-warning/15 text-warning',
  high: 'bg-danger/15 text-danger',
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
            className={`flex items-center justify-center h-8 px-3.5 text-xs font-display font-semibold rounded-md transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-60 ${
              isSelected ? PRIORITY_SELECTED_CLASS[p.value] : PRIORITY_OUTLINE_CLASS[p.value]
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