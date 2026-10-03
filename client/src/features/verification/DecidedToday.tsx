import { memo, useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, CornerUpLeft, History, RotateCcw, Send, Undo2 } from 'lucide-react';
import { Button, EmptyState, IconChip, InlineError, Skeleton, useConfirm } from '../../components';
import { formatTimeOnly } from '../checklist/checklistDisplay';
import { useCanReopen } from '../checklist/instance/useCanReopen';
import { useReopenApprovalMutation } from '../checklist/hook';
import { useChecklistDecisionsQuery, type ChecklistDecision } from './useChecklistDecisions';

const ACTION_CHIP: Record<ChecklistDecision['action'], { label: string; icon: typeof Send; tone: string }> = {
  APPROVE: { label: 'Approved', icon: CheckCircle2, tone: 'bg-success' },
  REJECT: { label: 'Sent back', icon: CornerUpLeft, tone: 'bg-danger' },
  SEND_BACK: { label: 'Sent back', icon: CornerUpLeft, tone: 'bg-danger' },
  SUBMIT: { label: 'Submitted', icon: Send, tone: 'bg-primary-600' },
};

interface DecisionRowProps {
  decision: ChecklistDecision;
  canReopen: boolean;
  reopening: boolean;
  onReopen: (decision: ChecklistDecision) => void;
}

const DecisionRow = memo(function DecisionRow({ decision, canReopen, reopening, onReopen }: DecisionRowProps) {
  const chip = ACTION_CHIP[decision.action];
  return (
    <li className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 sm:p-3.5 rounded-lg border border-border/60 bg-surface">
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <IconChip icon={chip.icon} tone={chip.tone} label={chip.label} />
          <Link
            to={`/checklists/${decision.instanceId}`}
            className="text-sm font-display font-semibold text-text leading-snug rounded-sm hover:text-primary-600 dark:hover:text-primary-400 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            {decision.title}
          </Link>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-display text-text-muted">
          {decision.storeName && <span>{decision.storeName}</span>}
          <span>{decision.action === 'SUBMIT' ? 'By' : 'Decided by'} {decision.actorName}</span>
          <span className="tabular-nums">{formatTimeOnly(decision.at)}</span>
          {decision.itemCount != null && decision.itemCount > 0 && (
            <span>{decision.itemCount} {decision.itemCount === 1 ? 'question' : 'questions'}</span>
          )}
        </p>
        {decision.note && <p className="text-xs font-display text-text-secondary whitespace-pre-wrap break-words line-clamp-3">{decision.note}</p>}
      </div>
      {decision.action === 'APPROVE' && canReopen && (
        <Button size="sm" variant="outline" className="self-end sm:self-start shrink-0" isLoading={reopening} onClick={() => onReopen(decision)}>
          {!reopening && <RotateCcw size={14} aria-hidden />}
          Reopen
        </Button>
      )}
    </li>
  );
});

const SkeletonRow = () => (
  <li className="flex flex-col gap-2 p-3.5 rounded-lg border border-border/60 bg-surface" aria-hidden>
    <div className="flex items-center gap-2">
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
    <Skeleton className="h-3 w-2/3" />
  </li>
);

interface DecidedTodayProps {
  /** Takes the reviewer back to the waiting list from the empty state. */
  onShowWaiting: () => void;
}

/** Today's decisions on checklists: approved, sent back and submitted, newest first. */
export const DecidedToday = ({ onShowWaiting }: DecidedTodayProps) => {
  const { data, isPending, isError, isFetching, refetch } = useChecklistDecisionsQuery();
  const canReopen = useCanReopen();
  const confirm = useConfirm();
  const reopen = useReopenApprovalMutation();
  const { mutate } = reopen;

  const decisions = useMemo(
    () => [...(data ?? [])].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [data],
  );

  const onReopen = useCallback(async (decision: ChecklistDecision) => {
    const ok = await confirm({
      title: 'Reopen this approval?',
      description: `"${decision.title}" goes back to the waiting list so it can be reviewed again.`,
      confirmLabel: 'Reopen',
    });
    if (ok) mutate(decision.instanceId);
  }, [confirm, mutate]);

  if (isError && !data) {
    return <InlineError message="We couldn't load today's decisions. Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return <ul className="flex flex-col gap-2" aria-hidden>{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}</ul>;
  }

  if (decisions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No decisions yet today"
        description="Approved and sent back checklists show up here as you work through the waiting list."
        action={{ label: 'Go to waiting', onClick: onShowWaiting, icon: Undo2 }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isError && <InlineError message="Showing the last list we loaded. The refresh failed." onRetry={() => refetch()} />}
      <ul className={isFetching ? 'flex flex-col gap-2 opacity-70 transition-opacity duration-150' : 'flex flex-col gap-2 transition-opacity duration-150'}>
        {decisions.map((d) => (
          <DecisionRow
            key={d.id}
            decision={d}
            canReopen={canReopen}
            reopening={reopen.isPending && reopen.variables === d.instanceId}
            onReopen={onReopen}
          />
        ))}
      </ul>
    </div>
  );
};
