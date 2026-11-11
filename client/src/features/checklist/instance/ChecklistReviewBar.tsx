import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Undo2 } from 'lucide-react';
import { Button, PANEL_CLASS } from '../../../components';
import { cn } from '@/lib/utils';
import { ReviewActions } from './ReviewActions';
import { approveLabelFor } from '../approvalStage';
import { useAuth } from '../../../context/AuthContext';
import { CorrectionDialog } from '../../verification/CorrectionDialog';
import { runCorrectionItems, type SendBackPayload } from '../../verification/correctionItems';
import { useDeferredDecisions } from '../../verification/useDeferredDecisions';
import { useRefreshAfterDecision } from '../../verification/useRefreshAfterDecision';
import { approveRun, rejectRun, sendBackRun } from '../../verification/decisionRequests';
import { runScores } from '../checklistCompliance';
import { complianceToneClass } from '../checklistDisplay';
import type { ReviewDraft } from '../../verification/useReviewDraft';
import type { ChecklistInstance } from '../../../api/checklistInstances';

type Props = {
  instance: ChecklistInstance;
  draft: ReviewDraft;
  onDecided?: () => void;
};

export const ReviewScoreStrip = ({ instance, className }: { instance: ChecklistInstance; className?: string }) => {
  const scores = useMemo(() => runScores(instance.items), [instance.items]);
  return (
    <p className={cn('flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums', className)}>
      <span className="flex items-baseline gap-1.5">
        <span className="t-card font-display font-bold text-text">{scores.completion}%</span>
        <span className="t-meta text-text-muted">complete</span>
      </span>
      {scores.compliance !== null && (
        <span className="flex items-baseline gap-1.5">
          <span className={cn('t-card font-display font-bold', complianceToneClass(scores.compliance))}>{scores.compliance}%</span>
          <span className="t-meta text-text-muted">compliance, {scores.good} of {scores.scored} answered well</span>
        </span>
      )}
      {scores.criticalFailed > 0 && (
        <span className="t-meta font-display font-semibold text-danger">{scores.criticalFailed} critical {scores.criticalFailed === 1 ? 'question' : 'questions'} failed</span>
      )}
    </p>
  );
};

export const ChecklistReviewBar = ({ instance, draft, onDecided }: Props) => {
  const { user: reviewer } = useAuth();
  const refresh = useRefreshAfterDecision();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const afterSaved = useCallback(async () => {
    await refresh();
    if (mounted.current) onDecided?.();
  }, [refresh, onDecided]);
  const { heldIds, schedule, undo } = useDeferredDecisions({ afterSaved });
  const held = heldIds.has(instance.id);
  const items = useMemo(() => runCorrectionItems(instance.items), [instance.items]);
  const count = draft.pickedIds.length;

  const send = ({ itemIds, note, fixByHours, photoOnlyItemIds }: SendBackPayload) => {
    draft.reset();
    schedule({
      id: instance.id,
      verb: 'Sent back',
      label: instance.title,
      run: itemIds.length ? sendBackRun(instance.id, itemIds, note, fixByHours, photoOnlyItemIds) : rejectRun(instance.id, note, fixByHours),
    });
  };

  const approve = () => schedule({ id: instance.id, verb: 'Approved', label: instance.title, run: approveRun(instance.id) });

  return (
    <div className={cn(PANEL_CLASS, 'app-bottom-chrome sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex flex-col gap-3 bg-surface p-3.5 sm:p-4')}>
      <ReviewScoreStrip instance={instance} className="lg:hidden" />
      {held ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" role="status">
          <p className="t-meta font-display text-text-secondary">Saving your decision in a few seconds. Undo if that was a mistake.</p>
          <Button variant="outline" size="md" className="h-11 sm:h-9 pointer-coarse:h-11 font-display" onClick={() => undo(instance.id)}>
            <Undo2 size={14} aria-hidden />
            Undo
          </Button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="t-meta font-display text-text-secondary">
            {count > 0
              ? `${count} ${count === 1 ? 'question' : 'questions'} picked. Send them for correction, or untick them to approve.`
              : 'Approve it, or send it for correction.'}
          </p>
          <ReviewActions
            pickedCount={count}
            approveLabel={approveLabelFor(reviewer?.role, instance)}
            onSendBack={() => draft.setSending(true)}
            onApprove={approve}
            busy={false}
            approving={false}
          />
        </div>
      )}
      <CorrectionDialog
        items={items}
        assigneeNames={instance.submittedByName ? [instance.submittedByName] : []}
        draft={draft}
        onSend={send}
        busy={false}
      />
    </div>
  );
};
