import type { ReactNode } from 'react';
import { ArrowDown, Camera, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, ChecklistProgressBar, PANEL_CLASS } from '../../../../components';
import { ChecklistSubmitButton, ChecklistSubmitError } from '../ChecklistSubmitBar';
import type { SubmitRun } from './useSubmitRun';
import type { FillProgress } from './fillProgress';

interface FillBottomBarProps {
  progress: FillProgress;
  canSubmit: boolean;
  resubmit: boolean;
  submit: SubmitRun;
  onNext?: () => void;
  onGoToPhoto?: (id: string) => void;
  late?: ReactNode;
  selfCompleteAll?: ReactNode;
}

/**
 * How many questions are answered but still owe their photo, and a way straight to the first of
 * them. Submit stays shut while this reads anything above zero, so it has to be reachable.
 */
export const PhotosMissingBadge = ({ progress, onGoTo, className }: { progress: FillProgress; onGoTo?: (id: string) => void; className?: string }) => {
  const { count, firstId } = progress.photosMissing;
  if (count === 0) return null;
  const label = count === 1 ? '1 photo still needed' : `${count} photos still needed`;

  if (!onGoTo || !firstId) {
    return (
      <span className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-danger/40 px-3 t-meta font-display font-semibold text-danger sm:min-h-9', className)}>
        <Camera className="size-3.5 shrink-0" aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onGoTo(firstId)}
      aria-label={`${label}. Go to the first one.`}
      className={cn(
        'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-danger/40 px-3 t-meta font-display font-semibold text-danger outline-none',
        'transition-colors duration-200 ease-in-out hover:border-danger hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-danger/40 active:scale-[0.985] sm:min-h-9',
        className,
      )}
    >
      <Camera className="size-3.5 shrink-0" aria-hidden />
      {label}
      <ArrowDown className="size-3.5 shrink-0" aria-hidden />
    </button>
  );
};

export const FillProgressText = ({ progress, className }: { progress: FillProgress; className?: string }) => {
  const { done, total, left, overdue, people } = progress;
  return (
    <p className={cn('min-w-0 t-card font-display font-semibold text-text tabular-nums', className)}>
      {left === 0 ? (
        <span className="inline-flex items-center gap-1.5 text-success"><CheckCheck className="size-4 shrink-0" aria-hidden /> All {total} done</span>
      ) : (
        <>
          <span className={overdue ? 'text-danger' : 'text-text'}>{left} left</span>
          <span className="t-meta font-medium text-text-muted"> of {total}</span>
        </>
      )}
      {people && (
        <span className="block t-meta font-medium text-text-muted">People checked {people.done} of {people.total}</span>
      )}
      <span className="sr-only">{done} done.</span>
    </p>
  );
};

export const FillBottomBar = ({ progress, canSubmit, resubmit, submit, onNext, onGoToPhoto, late, selfCompleteAll }: FillBottomBarProps) => (
  <div
    className={cn(
      PANEL_CLASS,
      'app-bottom-chrome sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex flex-col gap-2 bg-surface px-3 py-2.5 lg:hidden',
      submit.failed && 'border-danger/40',
    )}
  >
    <ChecklistSubmitError submit={submit} />
    <PhotosMissingBadge progress={progress} onGoTo={onGoToPhoto} className="w-full justify-center" />
    <ChecklistProgressBar done={progress.done} total={progress.total} tone={progress.overdue ? 'danger' : 'auto'} bare thin />
    <div className="flex items-center gap-3">
      <FillProgressText progress={progress} className="flex-1" />
      {late}
      {canSubmit ? (
        <ChecklistSubmitButton submit={submit} resubmit={resubmit} className="shrink-0" />
      ) : progress.left > 0 && onNext ? (
        <Button variant="outline" size="md" className="h-11 shrink-0 font-display" onClick={onNext}>
          Next
          <ArrowDown size={14} aria-hidden />
        </Button>
      ) : null}
    </div>
    {selfCompleteAll && <div className="pt-0.5">{selfCompleteAll}</div>}
  </div>
);
