import { Building2, User, Route, Workflow } from 'lucide-react';

interface AssignmentModeToggleProps {
  mode: 'MANUAL' | 'AUTO';
  onChange: (mode: 'MANUAL' | 'AUTO') => void;
  frontLine?: boolean;
}

const SEGMENT_BASE =
  'flex items-center justify-center gap-1.5 h-11 sm:h-9 px-2 text-sm sm:text-xs font-display font-semibold rounded-lg text-center transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]';
const SEGMENT_SELECTED = 'bg-surface text-text border border-border/60 dark:border-white/[0.08]';
const SEGMENT_IDLE = 'text-text-muted border border-transparent hover:text-text';

const OPTIONS = [
  { value: 'AUTO', label: 'Auto', icon: Route, help: 'The category picks the team, the person and the due time.' },
  { value: 'MANUAL', label: 'Manual', icon: User, help: 'You pick the team, the person and the due time.' },
] as const;

const FRONT_LINE_OPTIONS = [
  { value: 'AUTO', label: 'Auto', icon: Route, help: 'Pick what it is about. It decides the team and the due time.' },
  { value: 'MANUAL', label: 'Manual', icon: Building2, help: 'You pick the team and the due time. Their head picks who works on it.' },
] as const;

export const AssignmentModeToggle = ({ mode, onChange, frontLine = false }: AssignmentModeToggleProps) => {
  const options = frontLine ? FRONT_LINE_OPTIONS : OPTIONS;
  return (
  <div className="flex flex-col gap-1.5">
    <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
      <Workflow size={14} className="text-text-light" />
      How to send it
    </span>
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-hover/70" role="group" aria-label="How to send it">
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
