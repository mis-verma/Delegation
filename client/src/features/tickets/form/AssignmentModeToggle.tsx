import { User, Route, Workflow } from 'lucide-react';

interface AssignmentModeToggleProps {
  mode: 'MANUAL' | 'AUTO';
  onChange: (mode: 'MANUAL' | 'AUTO') => void;
}

const SEGMENT_BASE =
  'flex items-center justify-center gap-1.5 h-11 sm:h-9 px-2 text-sm sm:text-xs font-display font-semibold rounded-lg text-center transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]';
// Picked option is a raised surface on the grey track; idle is plain muted text.
const SEGMENT_SELECTED = 'bg-surface text-text border border-border/60 dark:border-white/[0.08]';
const SEGMENT_IDLE = 'text-text-muted border border-transparent hover:text-text';

const OPTIONS = [
  { value: 'AUTO', label: 'By category', icon: Route, help: 'The category picks the team, the person and the due time.' },
  { value: 'MANUAL', label: 'Choose myself', icon: User, help: 'You pick the team, the person and the due time.' },
] as const;

/** Managers and up: let the category route the ticket, or choose where it goes by hand. */
export const AssignmentModeToggle = ({ mode, onChange }: AssignmentModeToggleProps) => (
  <div className="flex flex-col gap-1.5">
    <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
      <Workflow size={14} className="text-text-light" />
      How to send it
    </span>
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-hover/70" role="group" aria-label="How to send it">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
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
      {OPTIONS.find(o => o.value === mode)?.help}
    </p>
  </div>
);
