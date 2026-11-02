import { AlertCircle } from 'lucide-react';
import { ASSIGNMENT_OPTIONS, FRONT_LINE_OPTIONS } from './assignmentOptions';

interface AssignmentChoiceProps {
  frontLine?: boolean;
  onChoose: (mode: 'AUTO' | 'MANUAL') => void;
  error?: string;
}

const LONG_HELP = {
  AUTO: 'Pick what the problem is about. The category decides the team, the person and the due time.',
  MANUAL: 'You choose the team, the person and the due time yourself.',
} as const;

const LONG_HELP_FRONT_LINE = {
  AUTO: 'Pick what the problem is about. It decides the team and the due time.',
  MANUAL: 'You choose the team and the due time. Their head picks who works on it.',
} as const;

export const AssignmentChoice = ({ frontLine = false, onChoose, error }: AssignmentChoiceProps) => {
  const options = frontLine ? FRONT_LINE_OPTIONS : ASSIGNMENT_OPTIONS;
  const help = frontLine ? LONG_HELP_FRONT_LINE : LONG_HELP;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="t-section font-display font-bold text-text">How should this ticket be sent?</h3>
        <p className="t-meta font-medium text-text-muted">Choose one to continue. The form follows your choice.</p>
      </div>
      <div role="radiogroup" aria-label="How should this ticket be sent?" aria-required="true" className="grid gap-3 sm:grid-cols-2">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked="false"
            onClick={() => onChoose(value)}
            className="flex min-h-28 cursor-pointer flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4 text-left outline-none transition-colors duration-150 hover:border-primary-600 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/50 [-webkit-tap-highlight-color:transparent]"
          >
            <span className="flex size-9 items-center justify-center rounded-md bg-primary-800 text-white" aria-hidden="true">
              <Icon className="size-4.5" strokeWidth={2.25} />
            </span>
            <span className="t-card font-display font-bold text-text">{label}</span>
            <span className="t-meta font-medium text-text-secondary">{help[value]}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-1.5 t-meta font-display font-medium text-danger">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
};
