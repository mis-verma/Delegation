import { User, Zap } from 'lucide-react';
import { LABEL_CLASS } from './formConstants';

interface AssignmentModeToggleProps {
  mode: 'MANUAL' | 'AUTO';
  onChange: (mode: 'MANUAL' | 'AUTO') => void;
}

const SEGMENT_BASE =
  'flex items-center justify-center gap-1.5 sm:gap-2 py-3 sm:py-2.5 px-1 text-xs font-display font-semibold rounded-lg text-center transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';
// Quiet segmented control: the active option is a plain surface card that sits slightly proud of
// the gray track (a hairline border is enough separation, no filled colour block) — the same idea
// as a Notion view switcher, where the picked tab reads as "raised" rather than "painted".
const SEGMENT_SELECTED = 'bg-surface text-text border border-border';
const SEGMENT_IDLE = 'text-text-muted border border-transparent hover:text-text hover:bg-surface-active/40';

export const AssignmentModeToggle = ({ mode, onChange }: AssignmentModeToggleProps) => (
  <div className="flex flex-col gap-2">
    <label className={LABEL_CLASS}>Assignment Strategy</label>
    {/* Was missing a track background/border entirely, so the idle option had nothing to sit
        inside of — it read as loose floating text rather than the other half of a toggle. */}
    <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-xl bg-surface-hover border border-border">
      <button
        type="button"
        onClick={() => onChange('MANUAL')}
        aria-pressed={mode === 'MANUAL'}
        className={`${SEGMENT_BASE} ${mode === 'MANUAL' ? SEGMENT_SELECTED : SEGMENT_IDLE}`}
      >
        <User className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Manual Dispatch</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('AUTO')}
        aria-pressed={mode === 'AUTO'}
        className={`${SEGMENT_BASE} ${mode === 'AUTO' ? SEGMENT_SELECTED : SEGMENT_IDLE}`}
      >
        <Zap className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Auto Assign</span>
      </button>
    </div>
  </div>
);
