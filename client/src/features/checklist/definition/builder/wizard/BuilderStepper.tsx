import { ArrowLeft, Check, AlertTriangle, Lock, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepItem {
  label: string;
  description?: string;
  icon?: LucideIcon;
  summary?: string;
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

type StepState = 'current' | 'done' | 'attention' | 'locked' | 'upcoming';

const STATE_LABEL: Record<StepState, string> = {
  current: 'In progress',
  done: 'Completed',
  attention: 'Needs attention',
  locked: 'Locked, complete the previous steps first',
  upcoming: 'Not started',
};

const TILE_TONE: Record<StepState, string> = {
  current: 'bg-linear-to-br from-vivid-blue to-vivid-sky text-white ring-4 ring-vivid-blue/20',
  done: 'bg-linear-to-br from-vivid-blue to-vivid-sky text-white',
  attention: 'bg-warning/15 text-warning border-2 border-warning/50',
  locked: 'bg-surface-hover text-text-light border border-border',
  upcoming: 'bg-surface text-text-secondary border border-border',
};

const BADGE_TONE: Partial<Record<StepState, string>> = {
  done: 'bg-success text-white',
  attention: 'bg-warning text-white',
  locked: 'bg-text-muted text-white',
};

const BADGE_ICON: Partial<Record<StepState, LucideIcon>> = {
  done: Check,
  attention: AlertTriangle,
  locked: Lock,
};

const stateOf = (index: number, current: number, maxReached: number, allUnlocked: boolean, valid: boolean): StepState => {
  if (index === current) return 'current';
  if (index > maxReached && !allUnlocked) return 'locked';
  if (!valid && index <= maxReached) return 'attention';
  if (valid && (index < current || index <= maxReached)) return 'done';
  return 'upcoming';
};

const StepTile = ({ step, index, state, size }: { step: StepItem; index: number; state: StepState; size: 'sm' | 'md' }) => {
  const Icon = step.icon;
  const Badge = BADGE_ICON[state];
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          'flex items-center justify-center rounded-xl t-meta font-display font-bold transition-all duration-200',
          size === 'md' ? 'size-10 pointer-coarse:size-11' : 'size-9',
          TILE_TONE[state],
        )}
      >
        {Icon ? <Icon size={size === 'md' ? 18 : 16} strokeWidth={2.25} aria-hidden="true" /> : index + 1}
      </span>
      {Badge && (
        <span
          className={cn('absolute -bottom-1 -right-1 flex size-4.5 items-center justify-center rounded-full border-2 border-surface', BADGE_TONE[state])}
          aria-hidden="true"
        >
          <Badge size={9} strokeWidth={3.5} />
        </span>
      )}
    </span>
  );
};

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
  const states = steps.map((_, index) => stateOf(index, current, maxReached, allUnlocked, isStepValid(index)));
  const doneCount = states.filter((s) => s === 'done').length;
  const currentStep = steps[current];

  return (
    <>
      <nav aria-label="Checklist builder progress" className={`xl:hidden flex flex-col gap-3 ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
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
            {currentStep && <StepTile step={currentStep} index={current} state="current" size="sm" />}
            <span className="flex min-w-0 flex-col">
              <span className="t-card font-display font-bold text-text truncate">{currentStep?.label}</span>
              {currentStep?.summary && <span className="t-meta font-display text-text-muted truncate">{currentStep.summary}</span>}
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-border/60 bg-surface px-2.5 py-1 t-meta font-display font-semibold text-text-secondary tabular-nums">
            {current + 1} of {steps.length}
          </span>
        </div>
        <ol className="flex items-center gap-1.5">
          {steps.map((step, index) => {
            const state = states[index];
            const locked = state === 'locked';
            const Icon = step.icon;
            return (
              <li key={step.label} className="flex-1">
                <button
                  type="button"
                  onClick={() => !locked && onSelect(index)}
                  disabled={locked}
                  aria-current={state === 'current' ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${step.label}. ${STATE_LABEL[state]}`}
                  className="flex h-11 w-full flex-col items-center justify-center gap-1 rounded-lg cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
                >
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full',
                      state === 'current' && 'bg-vivid-blue text-white',
                      state === 'done' && 'bg-success text-white',
                      state === 'attention' && 'bg-warning text-white',
                      (state === 'locked' || state === 'upcoming') && 'bg-surface-hover text-text-light',
                    )}
                    aria-hidden="true"
                  >
                    {state === 'done' ? <Check size={11} strokeWidth={3.5} /> : state === 'attention' ? <AlertTriangle size={10} strokeWidth={3} /> : Icon ? <Icon size={11} strokeWidth={2.5} /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      'h-1 w-full rounded-full transition-colors duration-200',
                      state === 'current' && 'bg-vivid-blue',
                      state === 'done' && 'bg-success',
                      state === 'attention' && 'bg-warning',
                      (state === 'locked' || state === 'upcoming') && 'bg-border',
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <nav aria-label="Checklist builder progress" className={`hidden xl:block w-full py-2 ${className}`}>
        <ol className="flex w-full items-start justify-between gap-1">
          {steps.map((step, index) => {
            const state = states[index];
            const locked = state === 'locked';
            const isLast = index === steps.length - 1;
            const connectorFilled = index < current || (index < maxReached && states[index] === 'done');
            return (
              <li key={step.label} className="flex flex-1 items-start last:flex-none">
                <button
                  type="button"
                  onClick={() => !locked && onSelect(index)}
                  disabled={locked}
                  aria-current={state === 'current' ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${step.label}. ${STATE_LABEL[state]}`}
                  className={cn(
                    'group flex shrink-0 items-center gap-3 rounded-xl p-1.5 pr-3 text-left select-none outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/50',
                    locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface-hover',
                    state === 'current' && 'bg-vivid-blue/8',
                  )}
                >
                  <StepTile step={step} index={index} state={state} size="md" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cn(
                        't-meta font-display whitespace-nowrap',
                        state === 'current' && 'font-bold text-vivid-blue-text',
                        state === 'done' && 'font-semibold text-text',
                        state === 'attention' && 'font-semibold text-warning',
                        (state === 'locked' || state === 'upcoming') && 'font-medium text-text-muted',
                      )}
                    >
                      {step.label}
                    </span>
                    {step.summary && state !== 'locked' ? (
                      <span
                        className={cn(
                          'inline-flex max-w-32 items-center truncate rounded-full px-2 py-px text-[11px] font-display font-semibold leading-4',
                          state === 'attention' ? 'bg-warning/15 text-warning' : 'bg-surface-hover text-text-secondary',
                        )}
                        title={step.summary}
                      >
                        {state === 'attention' ? 'Needs attention' : step.summary}
                      </span>
                    ) : (
                      <span className="text-[11px] font-display font-medium leading-4 text-text-light">{locked ? 'Locked' : state === 'done' ? 'Done' : state === 'current' ? 'In progress' : 'Not started'}</span>
                    )}
                  </span>
                </button>

                {!isLast && (
                  <span aria-hidden="true" className="mx-2 mt-[1.35rem] h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-border">
                    <span className={cn('block h-full bg-linear-to-r from-vivid-blue to-vivid-sky transition-[width] duration-300', connectorFilled ? 'w-full' : 'w-0')} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="sr-only" aria-live="polite">{doneCount} of {steps.length} steps complete</p>
      </nav>
    </>
  );
};
