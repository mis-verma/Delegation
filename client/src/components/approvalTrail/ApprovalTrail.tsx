import { Check, Clock, Minus, Send, ShieldCheck, UserCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApprovalStage } from '../../lib/ticketApproval';

type StepState = 'done' | 'current' | 'waiting' | 'skipped';

export interface ApprovalTrailProps {
  pending: boolean;
  closed: boolean;
  stage: ApprovalStage;
  submittedAt?: string | null;
  hodApprovedAt?: string | null;
  hodName?: string | null;
  finalAt?: string | null;
  finalName?: string | null;
  hideHead?: boolean;
}

interface Step {
  key: string;
  label: string;
  icon: LucideIcon;
  state: StepState;
  detail: string;
}

const shortWhen = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;

const buildSteps = (p: ApprovalTrailProps): Step[] => {
  const steps = buildAllSteps(p);
  return p.hideHead ? steps.filter((s) => s.key !== 'hod') : steps;
};

const buildAllSteps = (p: ApprovalTrailProps): Step[] => {
  const hodDone = !!p.hodApprovedAt;
  const hodSkipped = !hodDone && (p.closed || (p.pending && p.stage === 'PC'));
  return [
    { key: 'work', label: 'Work done', icon: Send, state: 'done', detail: shortWhen(p.submittedAt) ?? 'Handed in' },
    {
      key: 'hod',
      label: 'Department head',
      icon: UserCheck,
      state: hodDone ? 'done' : hodSkipped ? 'skipped' : p.pending && p.stage === 'HOD' ? 'current' : 'waiting',
      detail: hodDone
        ? [p.hodName, shortWhen(p.hodApprovedAt)].filter(Boolean).join(', ')
        : hodSkipped ? 'Skipped' : p.pending && p.stage === 'HOD' ? 'Reviewing now' : 'Next',
    },
    {
      key: 'pc',
      label: 'PC, final',
      icon: ShieldCheck,
      state: p.closed ? 'done' : p.pending && p.stage === 'PC' ? 'current' : 'waiting',
      detail: p.closed
        ? [p.finalName, shortWhen(p.finalAt)].filter(Boolean).join(', ') || 'Approved'
        : p.pending && p.stage === 'PC' ? 'Reviewing now' : p.hideHead ? 'Next' : 'After the head',
    },
  ];
};

const TILE: Record<StepState, string> = {
  done: 'bg-success text-white',
  current: 'bg-linear-to-br from-primary-500 to-primary-700 text-white ring-4 ring-primary-500/20',
  waiting: 'bg-surface-hover text-text-light border border-border',
  skipped: 'bg-surface-hover text-text-muted border border-dashed border-border-hover',
};

export const ApprovalTrail = (props: ApprovalTrailProps) => {
  if (!props.pending && !props.closed) return null;
  const steps = buildSteps(props);

  return (
    <ol aria-label="Approval progress" className={cn('grid gap-2 rounded-xl border border-border/60 bg-surface p-2.5 sm:p-3', steps.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {steps.map((step, index) => {
        const Icon = step.state === 'done' ? Check : step.state === 'skipped' ? Minus : step.state === 'waiting' ? Clock : step.icon;
        return (
          <li key={step.key} className="relative flex min-w-0 flex-col items-center gap-1.5 text-center" aria-current={step.state === 'current' ? 'step' : undefined}>
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cn('absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2', steps[index - 1].state === 'done' && step.state !== 'waiting' ? 'bg-success' : 'bg-border')}
              />
            )}
            <span className={cn('relative z-10 flex size-8 items-center justify-center rounded-full transition-colors duration-200', TILE[step.state])} aria-hidden="true">
              <Icon size={15} strokeWidth={2.5} />
            </span>
            <span className="t-meta font-display font-bold leading-tight text-text">{step.label}</span>
            <span className={cn('t-meta font-display leading-tight', step.state === 'current' ? 'font-semibold text-primary-700 dark:text-primary-300' : 'text-text-muted')}>
              {step.detail}
            </span>
          </li>
        );
      })}
    </ol>
  );
};
