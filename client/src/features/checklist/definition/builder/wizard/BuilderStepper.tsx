import type { ReactNode } from 'react';
import { ArrowLeft, Check, AlertTriangle, Lock } from 'lucide-react';

export interface StepItem {
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface BuilderStepperProps {
  steps: readonly StepItem[];
  current: number;
  maxReached: number;
  allUnlocked: boolean;
  isStepValid: (index: number) => boolean;
  onSelect: (index: number) => void;
  onExit?: () => void;
  className?: string;
}

export const BuilderStepper = ({
  steps,
  current,
  maxReached,
  allUnlocked,
  isStepValid,
  onSelect,
  onExit,
  className = '',
}: BuilderStepperProps) => {
  return (
    <>
    <nav aria-label="Checklist builder progress" className={`xl:hidden flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              aria-label="Back to Recurring Checklists"
              className="sm:hidden -ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          )}
          <span className="t-card font-display font-bold text-text truncate">{steps[current]?.label}</span>
        </span>
        <span className="t-meta font-display font-medium text-text-muted tabular-nums">Step {current + 1} of {steps.length}</span>
      </div>
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const isLocked = index > maxReached && !allUnlocked;
          const isCurrent = index === current;
          const isValid = isStepValid(index);
          const needsAttention = !isCurrent && !isLocked && !isValid && index < maxReached;
          return (
            <li key={step.label} className="flex-1">
              <button
                type="button"
                onClick={() => !isLocked && onSelect(index)}
                disabled={isLocked}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Step ${index + 1}: ${step.label}${isLocked ? ' (locked)' : needsAttention ? ' (needs attention)' : ''}`}
                className="flex items-center w-full h-11 cursor-pointer disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 rounded-full"
              >
                <span
                  className={[
                    'h-1.5 w-full rounded-full transition-colors duration-200',
                    isCurrent && 'bg-primary-700 dark:bg-primary-400',
                    needsAttention && 'bg-warning',
                    !isCurrent && !needsAttention && !isLocked && index <= maxReached && 'bg-primary-500/45',
                    !isCurrent && !needsAttention && (isLocked || index > maxReached) && 'bg-border',
                  ].filter(Boolean).join(' ')}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
    <nav
      aria-label="Checklist builder progress"
      className={`hidden xl:block w-full overflow-x-auto no-scrollbar py-2 ${className}`}
    >
      <ol className="flex items-center justify-between min-w-max sm:min-w-0 w-full gap-1 sm:gap-2">
        {steps.map((step, index) => {
          const isLocked = index > maxReached && !allUnlocked;
          const isCurrent = index === current;
          const isValid = isStepValid(index);
          const isCompleted = index < current && isValid;
          const isConnectorFilled = index < current;
          const isLast = index === steps.length - 1;

          let statusDescription = 'In progress';
          if (isLocked) statusDescription = 'Locked (complete previous steps first)';
          else if (isCompleted) statusDescription = 'Completed';
          else if (!isValid && index < maxReached) statusDescription = 'Needs attention';

          return (
            <li
              key={step.label}
              className="flex items-center flex-1 last:flex-none"
            >
              <button
                type="button"
                onClick={() => !isLocked && onSelect(index)}
                disabled={isLocked}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Step ${index + 1}: ${step.label} (${statusDescription})`}
                className={`group flex items-center gap-2.5 shrink-0 rounded-lg p-1 pointer-coarse:min-h-11 pointer-coarse:px-2 transition-all duration-150 select-none ${isLocked
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer hover:bg-muted/40'
                  } focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50`}
              >
                <span
                  className={[
                    'flex size-8 pointer-coarse:size-9 shrink-0 items-center justify-center rounded-full t-meta font-display font-bold transition-all duration-200',
                    isLocked && 'bg-surface-hover text-text-light border border-border',
                    !isLocked && isCurrent && 'bg-primary-700 text-white ring-4 ring-primary-500/20 scale-105',
                    !isLocked && !isCurrent && isValid && 'bg-primary-700 text-white group-hover:scale-105',
                    !isLocked && !isCurrent && !isValid && 'bg-warning/15 text-warning border-2 border-warning/50 font-semibold group-hover:bg-warning/20',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {isLocked ? (
                    <Lock size={12} className="text-text-muted" />
                  ) : !isCurrent && isValid ? (
                    <Check size={14} strokeWidth={3} />
                  ) : !isCurrent && !isValid ? (
                    <AlertTriangle size={13} strokeWidth={2.5} />
                  ) : (
                    index + 1
                  )}
                </span>

                <div className="flex flex-col text-left">
                  <span
                    className={[
                      't-meta font-display font-medium whitespace-nowrap transition-colors duration-150',
                      isLocked && 'text-text-muted',
                      !isLocked && isCurrent && 'text-primary-700 dark:text-primary-400 font-bold',
                      !isLocked && !isCurrent && isValid && 'text-text-secondary group-hover:text-text',
                      !isLocked && !isCurrent && !isValid && 'text-warning font-semibold',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {step.label}
                  </span>

                  {step.description && (
                    <span className="hidden md:inline t-meta text-text-muted">
                      {step.description}
                    </span>
                  )}
                </div>
              </button>

              {!isLast && (
                <div
                  aria-hidden="true"
                  className="mx-2 sm:mx-3 flex-1 h-0.5 min-w-5 sm:min-w-8 rounded-full bg-border overflow-hidden"
                >
                  <div
                    className={`h-full transition-all duration-300 ${isConnectorFilled ? 'bg-primary-700 w-full' : 'w-0'
                      }`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
    </>
  )
}
