import { memo } from 'react';
import { Link } from 'react-router';
import { Clock, MessageSquare, RotateCcw } from 'lucide-react';
import { Button, ApprovalStatusChip } from '../../components';
import type { ChecklistDecision } from './useChecklistDecisions';
import { ACTION_CHIP, DAY_TIME, FULL_DATE, initialsOf, parseAt, questionsLabelOf, statusKeyOf } from './decisionDisplay';

export interface DecisionCardProps {
  decision: ChecklistDecision;
  canReopen: boolean;
  reopening: boolean;
  onReopen: (decision: ChecklistDecision) => void;
}

// Phone (below lg) view of one approval. The one thing a row can ask for is Reopen, so it is a
// ghost button with a 44px touch target; everything else is read-only.
export const DecisionCard = memo(function DecisionCard({ decision, canReopen, reopening, onReopen }: DecisionCardProps) {
  const chip = ACTION_CHIP[decision.action];
  const at = parseAt(decision.at);
  const who = decision.actorName?.trim() || null;
  const questions = decision.itemCount ?? 0;
  const meta = [decision.storeName, questions > 0 ? questionsLabelOf(questions) : null].filter(Boolean).join(' · ');

  return (
    <li className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-surface p-3 transition-[border-color] duration-150 hover:border-border-hover">
      <div className="flex items-center justify-between gap-2">
        <ApprovalStatusChip status={statusKeyOf(decision.action)} label={chip.label} title={chip.label} />
        {at && (
          <time dateTime={at.toISOString()} title={FULL_DATE.format(at)} className="flex shrink-0 items-center gap-1.5 t-meta tabular-nums text-text-muted">
            <Clock className="size-3" aria-hidden />
            {DAY_TIME.format(at)}
          </time>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          to={`/checklists/${decision.instanceId}`}
          className="t-card font-display font-semibold leading-snug line-clamp-2 text-text rounded-sm hover:underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          {decision.title}
        </Link>
        {meta && <p className="t-meta text-text-muted">{meta}</p>}
      </div>

      {decision.note && (
        <p className="flex items-start gap-1.5 t-meta text-text-secondary">
          <MessageSquare className="size-3 shrink-0" aria-hidden />
          <span className="min-w-0 line-clamp-2">{decision.note}</span>
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
        {who ? (
          <span className="flex min-w-0 items-center gap-2 t-meta font-semibold text-text-secondary">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-500/15 t-meta font-display font-bold text-primary-700 dark:text-primary-300">
              {initialsOf(who)}
            </span>
            <span className="min-w-0 break-words">{who}</span>
          </span>
        ) : (
          <span className="t-meta text-text-light">No approver</span>
        )}
        {canReopen && decision.action === 'APPROVE' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-11 shrink-0 px-3"
            aria-label={`Reopen ${decision.title}`}
            isLoading={reopening}
            onClick={() => onReopen(decision)}
          >
            {!reopening && <RotateCcw size={14} aria-hidden />}
            Reopen
          </Button>
        )}
      </div>
    </li>
  );
});
