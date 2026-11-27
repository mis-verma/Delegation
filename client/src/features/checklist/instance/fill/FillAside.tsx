import type { ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, ChecklistProgressBar, PANEL_CLASS } from '../../../../components';
import { complianceToneClass, instanceProgressToneClass } from '../../checklistDisplay';
import { ChecklistSubmitButton, ChecklistSubmitError } from '../ChecklistSubmitBar';
import { FillProgressText, PhotosMissingBadge } from './FillBottomBar';
import type { SubmitRun } from './useSubmitRun';
import type { FillProgress } from './fillProgress';

interface FillAsideProps {
  progress: FillProgress;
  completion: number;
  isComplete: boolean;
  compliance: number | null;
  good: number;
  scored: number;
  late?: ReactNode;
  canSubmit: boolean;
  resubmit: boolean;
  submit: SubmitRun;
  onNext?: () => void;
  onGoToPhoto?: (id: string) => void;
  title: string;
  selfCompleteAll?: ReactNode;
}

export const FillAside = ({
  progress, completion, isComplete, compliance, good, scored, late, canSubmit, resubmit, submit, onNext, onGoToPhoto, title, selfCompleteAll,
}: FillAsideProps) => (
  <aside aria-label={title} className="hidden lg:col-span-4 lg:flex lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh_-_2rem)] flex-col gap-3 overflow-hidden">
    <div className={cn(PANEL_CLASS, 'flex shrink-0 flex-col gap-4 p-4')}>
      <div className="flex flex-col gap-1.5">
        <span className="t-meta font-display font-semibold text-text-muted">Completion</span>
        <span className="flex flex-wrap items-baseline gap-x-2.5 tabular-nums">
          <span className={cn('t-stat font-display font-bold leading-none', instanceProgressToneClass(progress.overdue, isComplete))}>{completion}%</span>
          <FillProgressText progress={progress} className="t-meta" />
        </span>
        <ChecklistProgressBar done={progress.done} total={progress.total} tone={progress.overdue ? 'danger' : 'auto'} bare />
      </div>
      {compliance !== null && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
          <span className="t-meta font-display font-semibold text-text-muted">Compliance</span>
          <span className="flex flex-wrap items-baseline gap-x-2.5 tabular-nums">
            <span className={cn('t-stat font-display font-bold leading-none', complianceToneClass(compliance))}>{compliance}%</span>
            <span className="t-meta font-medium text-text-secondary">{good} of {scored} answered well</span>
          </span>
          <ChecklistProgressBar done={good} total={scored} tone="auto" bare />
        </div>
      )}
      {late}
      <PhotosMissingBadge progress={progress} onGoTo={onGoToPhoto} className="w-full justify-center" />
      <ChecklistSubmitError submit={submit} />
      {canSubmit ? (
        <ChecklistSubmitButton submit={submit} resubmit={resubmit} className="w-full" />
      ) : progress.left > 0 && onNext ? (
        <Button variant="outline" size="md" className="h-11 w-full font-display" onClick={onNext}>
          Next question
          <ArrowDown size={14} aria-hidden />
        </Button>
      ) : null}
      {selfCompleteAll}
    </div>
  </aside>
);
