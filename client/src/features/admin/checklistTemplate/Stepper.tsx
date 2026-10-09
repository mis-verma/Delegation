import { Check } from 'lucide-react';

interface StepperProps {
  steps: string[];
  current: number;
  /** Lets a user jump back to any already-completed step by clicking its circle/label — jumping
   *  forward isn't allowed since later steps may depend on data validated on this one. */
  onStepClick?: (index: number) => void;
}

// A first pass, deliberately plain — numbered circles, a connecting line, click-back to a
// completed step. Scoped to this one form for now; promote to a shared component once there's a
// second caller with its own opinion on how it should look/behave.
export const Stepper = ({ steps, current, onStepClick }: StepperProps) => (
  <div className="flex items-center w-full px-1">
    {steps.map((label, i) => {
      const isDone = i < current;
      const isActive = i === current;
      const clickable = isDone && !!onStepClick;

      return (
        <div key={label} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
          <button
            type="button"
            onClick={clickable ? () => onStepClick(i) : undefined}
            disabled={!clickable}
            aria-current={isActive ? 'step' : undefined}
            aria-label={`Step ${i + 1}: ${label}`}
            className={`flex items-center gap-2 shrink-0 rounded-lg outline-none pointer-coarse:min-h-11 ${
              clickable ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40' : 'cursor-default'
            }`}
          >
            <span
              className={`flex items-center justify-center size-7 rounded-full text-xs font-bold shrink-0 transition-colors duration-200 ${
                isDone
                  ? 'bg-primary-600 text-white'
                  : isActive
                    ? 'bg-primary-600 text-white ring-4 ring-primary-500/15'
                    : 'bg-surface-hover text-text-muted border border-border'
              }`}
            >
              {isDone ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={`hidden sm:inline text-xs font-display font-medium whitespace-nowrap ${
                isActive || isDone ? 'text-text' : 'text-text-muted'
              }`}
            >
              {label}
            </span>
          </button>

          {i < steps.length - 1 && (
            <span className={`flex-1 h-px mx-3 transition-colors duration-300 ${isDone ? 'bg-primary-500' : 'bg-border'}`} />
          )}
        </div>
      );
    })}
  </div>
);
