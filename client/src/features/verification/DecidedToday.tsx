import { memo, useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, CornerUpLeft, History, RotateCcw, Send, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState, InlineError, useConfirm, ApprovalStatusChip, VerifiedByChip, VerifiedAtChip } from '../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TD_CLASS, TableSkeleton } from '../../components/dataTable';
import { useCanReopen } from '../checklist/instance/useCanReopen';
import { useReopenApprovalMutation } from '../checklist/hook';
import { useChecklistDecisionsQuery, type ChecklistDecision } from './useChecklistDecisions';

const ACTION_CHIP: Record<ChecklistDecision['action'], { label: string; icon: typeof Send; tone: string }> = {
  APPROVE: { label: 'Approved', icon: CheckCircle2, tone: 'bg-success' },
  REJECT: { label: 'Sent back', icon: CornerUpLeft, tone: 'bg-danger' },
  SEND_BACK: { label: 'Sent back', icon: CornerUpLeft, tone: 'bg-danger' },
  SUBMIT: { label: 'Submitted', icon: Send, tone: 'bg-primary-600' },
};

// Widths are fixed so the sticky "who/when" columns can use a predictable left offset
// instead of measuring the title column at runtime.
const COL1_WIDTH = 'w-64 min-w-64 max-w-64';
const COL2_WIDTH = 'w-40 min-w-40 max-w-40';
const COL2_LEFT = 'left-64';

interface ReopenButtonProps {
  canReopen: boolean;
  reopening: boolean;
  onReopen: () => void;
}

const ReopenButton = ({ canReopen, reopening, onReopen }: ReopenButtonProps) => {
  if (!canReopen) return null;
  return (
    <Button size="sm" variant="outline" isLoading={reopening} onClick={onReopen}>
      {!reopening && <RotateCcw size={14} aria-hidden />}
      Reopen
    </Button>
  );
};

interface DecisionRowProps {
  decision: ChecklistDecision;
  canReopen: boolean;
  reopening: boolean;
  onReopen: (decision: ChecklistDecision) => void;
}

const DecisionCard = memo(function DecisionCard({ decision, canReopen, reopening, onReopen }: DecisionRowProps) {
  const chip = ACTION_CHIP[decision.action];
  const statusKey = decision.action === 'APPROVE' ? 'APPROVED' : decision.action === 'SUBMIT' ? 'SUBMITTED' : 'REJECTED';
  return (
    <li className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 sm:p-4 rounded-xl border border-border/60 bg-surface">
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ApprovalStatusChip status={statusKey} label={chip.label} />
          {decision.actorName && (
            <VerifiedByChip verifierName={decision.actorName} />
          )}
          {decision.at && (
            <VerifiedAtChip timestamp={decision.at} format="time" />
          )}
          <Link
            to={`/checklists/${decision.instanceId}`}
            className="t-card font-display font-semibold text-text leading-snug line-clamp-2 rounded-sm hover:underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            {decision.title}
          </Link>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 t-meta font-display text-text-muted">
          {decision.storeName && <span>{decision.storeName}</span>}
          {decision.itemCount != null && decision.itemCount > 0 && (
            <span>{decision.itemCount} {decision.itemCount === 1 ? 'question' : 'questions'}</span>
          )}
        </p>
        {decision.note && <p className="t-meta font-display text-text-secondary whitespace-pre-wrap break-words line-clamp-3">{decision.note}</p>}
      </div>
      <ReopenButton canReopen={decision.action === 'APPROVE' && canReopen} reopening={reopening} onReopen={() => onReopen(decision)} />
    </li>
  );
});

const DecisionTableRow = memo(function DecisionTableRow({ decision, canReopen, reopening, onReopen }: DecisionRowProps) {
  const chip = ACTION_CHIP[decision.action];
  const statusKey = decision.action === 'APPROVE' ? 'APPROVED' : decision.action === 'SUBMIT' ? 'SUBMITTED' : 'REJECTED';
  return (
    <tr className="group border-t border-border/60">
      <th scope="row" className={cn(TD_CLASS, COL1_WIDTH, 'sticky left-0 z-10 bg-surface font-normal transition-colors group-hover:bg-surface-hover')}>
        <div className="flex flex-col gap-0.5 text-left">
          <Link
            to={`/checklists/${decision.instanceId}`}
            className="t-card font-display font-semibold text-text leading-snug line-clamp-2 rounded-sm hover:underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            {decision.title}
          </Link>
          {decision.storeName && <span className="t-meta text-text-muted">{decision.storeName}</span>}
        </div>
      </th>
      <td className={cn(TD_CLASS, COL2_WIDTH, COL2_LEFT, 'sticky z-10 bg-surface border-l border-border/60 transition-colors group-hover:bg-surface-hover')}>
        {decision.actorName ? <VerifiedByChip verifierName={decision.actorName} /> : <span className="text-text-light">-</span>}
      </td>
      <td className={cn(TD_CLASS, 'whitespace-nowrap border-l border-border/60')}>
        {decision.at ? <VerifiedAtChip timestamp={decision.at} format="time" /> : <span className="text-text-light">-</span>}
      </td>
      <td className={cn(TD_CLASS, 'border-l border-border/60')}><ApprovalStatusChip status={statusKey} label={chip.label} /></td>
      <td className={cn(TD_CLASS, 'border-l border-border/60 tabular-nums')}>
        {decision.itemCount != null && decision.itemCount > 0 ? `${decision.itemCount} ${decision.itemCount === 1 ? 'question' : 'questions'}` : <span className="text-text-light">-</span>}
      </td>
      <td className={cn(TD_CLASS, 'max-w-sm border-l border-border/60 whitespace-pre-wrap break-words')}>
        {decision.note || <span className="text-text-light">-</span>}
      </td>
      <td className={cn(TD_CLASS, 'border-l border-border/60 text-right')}>
        <ReopenButton canReopen={decision.action === 'APPROVE' && canReopen} reopening={reopening} onReopen={() => onReopen(decision)} />
      </td>
    </tr>
  );
});

interface DecidedTodayProps {
  onShowWaiting?: () => void;
  waitingIds?: ReadonlySet<string>;
}

export const DecidedToday = ({ onShowWaiting, waitingIds }: DecidedTodayProps) => {
  const { data, isPending, isError, refetch } = useChecklistDecisionsQuery();
  const canReopen = useCanReopen();
  const confirm = useConfirm();
  const reopen = useReopenApprovalMutation();
  const { mutate } = reopen;

  const decisions = useMemo(
    () => (data ?? []).filter((d) => d.action !== 'SUBMIT').sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [data],
  );
  const latestApproval = useMemo(() => {
    const seen = new Set<string>();
    const ids = new Set<string>();
    for (const d of decisions) {
      if (d.action !== 'APPROVE' || seen.has(d.instanceId)) continue;
      seen.add(d.instanceId);
      ids.add(d.id);
    }
    return ids;
  }, [decisions]);

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
    return <TableSkeleton rows={4} label="Loading approval history" />;
  }

  if (decisions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No decisions yet today"
        description="Approved and sent back checklists show up here as you work through the pending list above."
        action={onShowWaiting ? { label: 'Back to the waiting list', onClick: onShowWaiting, icon: Undo2 } : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isError && <InlineError message="Showing the last list we loaded. The refresh failed." onRetry={() => refetch()} />}

      <ul className="flex flex-col gap-3 lg:hidden">
        {decisions.map((d) => (
          <DecisionCard
            key={d.id}
            decision={d}
            canReopen={canReopen && latestApproval.has(d.id) && !waitingIds?.has(d.instanceId)}
            reopening={reopen.isPending && reopen.variables === d.instanceId}
            onReopen={onReopen}
          />
        ))}
      </ul>

      <div className={cn(TABLE_FRAME_CLASS, 'hidden lg:block')}>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Today's approval history</caption>
          <thead className="sticky top-0 z-20">
            <tr>
              <th scope="col" className={cn(TH_CLASS, COL1_WIDTH, 'sticky left-0 z-30')}>Checklist</th>
              <th scope="col" className={cn(TH_CLASS, COL2_WIDTH, COL2_LEFT, 'sticky z-30 border-l border-primary-900/40')}>Approved by</th>
              <th scope="col" className={cn(TH_CLASS, 'whitespace-nowrap border-l border-primary-900/40')}>Date &amp; time</th>
              <th scope="col" className={cn(TH_CLASS, 'border-l border-primary-900/40')}>Decision</th>
              <th scope="col" className={cn(TH_CLASS, 'border-l border-primary-900/40')}>Questions</th>
              <th scope="col" className={cn(TH_CLASS, 'border-l border-primary-900/40')}>Note</th>
              <th scope="col" className={cn(TH_CLASS, 'border-l border-primary-900/40')}><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <DecisionTableRow
                key={d.id}
                decision={d}
                canReopen={canReopen && latestApproval.has(d.id) && !waitingIds?.has(d.instanceId)}
                reopening={reopen.isPending && reopen.variables === d.instanceId}
                onReopen={onReopen}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
