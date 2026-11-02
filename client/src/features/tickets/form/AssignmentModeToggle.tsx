import { Workflow } from 'lucide-react';
import { ASSIGNMENT_OPTIONS, FRONT_LINE_OPTIONS } from './assignmentOptions';

interface AssignmentModeToggleProps {
  mode: 'MANUAL' | 'AUTO';
  onChange: (mode: 'MANUAL' | 'AUTO') => void;
  frontLine?: boolean;
  hideLabel?: boolean;
}

const SEGMENT_BASE =
  'flex items-center justify-center gap-1.5 h-11 sm:h-9 px-2 text-sm sm:text-xs font-display font-semibold rounded-sm text-center transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]';
const SEGMENT_SELECTED = 'bg-primary-800 text-white border border-transparent shadow-[inset_0_-2px_0_var(--color-gold)]';
const SEGMENT_IDLE = 'text-text-secondary border border-transparent hover:bg-surface-hover hover:text-text';

export const AssignmentModeToggle = ({ mode, onChange, frontLine = false, hideLabel = false }: AssignmentModeToggleProps) => {
  const options = frontLine ? FRONT_LINE_OPTIONS : ASSIGNMENT_OPTIONS;
  return (
  <div className="flex flex-col gap-1.5">
    {!hideLabel && (
      <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
      <Workflow size={14} className="text-text-light" />
      How to send it
    </span>
    )}
    <div className="grid grid-cols-2 gap-0.5 rounded-md border border-border bg-surface p-0.5" role="group" aria-label="How to send it">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          className={`${SEGMENT_BASE} ${mode === value ? SEGMENT_SELECTED : SEGMENT_IDLE}`}
        >
          <Icon className="size-3.5 shrink-0" /> <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
    <p className="px-1 t-meta font-display text-text-muted">
      {options.find(o => o.value === mode)?.help}
    </p>
  </div>
  );
};
