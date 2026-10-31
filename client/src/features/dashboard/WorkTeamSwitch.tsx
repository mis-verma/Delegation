import { cn } from '@/lib/utils';
import type { FocusView } from './useFocusView';

const OPTIONS: readonly { value: FocusView; label: string }[] = [
  { value: 'work', label: 'My work' },
  { value: 'team', label: 'My team' },
];

interface WorkTeamSwitchProps {
  value: FocusView;
  onChange: (value: FocusView) => void;
  teamCount: number;
}

export const WorkTeamSwitch = ({ value, onChange, teamCount }: WorkTeamSwitchProps) => (
  <div
    role="radiogroup"
    aria-label="Show my work or my team"
    className="relative grid w-full grid-cols-2 rounded-full border border-border/60 bg-surface-hover/60 p-1 sm:w-72"
  >
    <span
      aria-hidden="true"
      className={cn(
        'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-surface ring-1 ring-border transition-transform duration-200 ease-out motion-reduce:transition-none',
        value === 'team' ? 'translate-x-full' : 'translate-x-0',
      )}
    />
    {OPTIONS.map((option) => {
      const active = value === option.value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative z-10 inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full t-meta font-display font-semibold outline-none transition-colors duration-150 pointer-coarse:h-11 focus-visible:ring-2 focus-visible:ring-primary-500/40',
            active ? 'text-text' : 'text-text-muted hover:text-text',
          )}
        >
          {option.label}
          {option.value === 'team' && teamCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger/10 px-1.5 t-meta font-bold tabular-nums text-danger" aria-label={`${teamCount} behind`}>
              {teamCount}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
