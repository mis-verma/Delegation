import { User, Zap, Workflow } from 'lucide-react';
import { DETAIL_HEADING_CLASS } from '../../tasks/taskFormFieldStyles';

interface AssignmentModeToggleProps {
  mode: 'MANUAL' | 'AUTO';
  onChange: (mode: 'MANUAL' | 'AUTO') => void;
}

const SEGMENT_BASE =
  'flex items-center justify-center gap-1.5 h-11 sm:h-9 px-2 text-sm sm:text-xs font-display font-semibold rounded-lg text-center transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]';
// Picked option is a raised surface on the grey track; idle is plain muted text.
const SEGMENT_SELECTED = 'bg-surface text-text border border-border/60 dark:border-white/[0.08]';
const SEGMENT_IDLE = 'text-text-muted border border-transparent hover:text-text';

export const AssignmentModeToggle = ({ mode, onChange }: AssignmentModeToggleProps) => (
  <div className="flex flex-col gap-1.5">
    <span className={DETAIL_HEADING_CLASS}>
      <Workflow size={14} className="text-text-light" />
      Assignment
    </span>
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-hover/70" role="group" aria-label="Assignment">
      <button
        type="button"
        onClick={() => onChange('MANUAL')}
        aria-pressed={mode === 'MANUAL'}
        className={`${SEGMENT_BASE} ${mode === 'MANUAL' ? SEGMENT_SELECTED : SEGMENT_IDLE}`}
      >
        <User className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Manual</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('AUTO')}
        aria-pressed={mode === 'AUTO'}
        className={`${SEGMENT_BASE} ${mode === 'AUTO' ? SEGMENT_SELECTED : SEGMENT_IDLE}`}
      >
        <Zap className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Auto assign</span>
      </button>
    </div>
    <p className="px-1 text-xs font-display text-text-muted">
      {mode === 'MANUAL'
        ? 'You choose the department, the person and the due date.'
        : 'The category decides the department, the person and the due time.'}
    </p>
  </div>
);
