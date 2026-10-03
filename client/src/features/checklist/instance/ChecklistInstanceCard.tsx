import { Link } from 'react-router';
import { runScores } from '../checklistCompliance';
import { complianceToneClass } from '../checklistDisplay';
import { StatusChip } from '@/components/statusChip';
import { IconChip } from '../../../components';
import {
  formatDateShort,
  formatDeadlineTime,
  instanceProgressBarClass,
  instanceProgressToneClass,
  isInstanceOverdue,
  RECURRENCE_LABEL,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_CHIP,
} from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface ChecklistInstanceCardProps {
  instance: ChecklistInstance;
}


export const ChecklistInstanceCard = ({ instance }: ChecklistInstanceCardProps) => {
  const rawTotal = instance.items.length;
  const isComplete = rawTotal > 0 && instance.items.every(i => i.isDone);
  // "Not applicable" questions are neutral: out of both the done count and the total.
  const { done, total, completion: progress, compliance } = runScores(instance.items);
  const overdue = isInstanceOverdue(instance, isComplete);
  const deadlineTime = formatDeadlineTime(instance);
  const verification = VERIFICATION_CHIP[instance.verificationStatus];
  const showVerification = isComplete || instance.verificationStatus !== 'NOT_SUBMITTED';

  return (
    <Link
      to={`/checklists/${instance.id}`}
      className="flex flex-col gap-2.5 p-3.5 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface hover:border-primary-500/50 active:bg-surface-hover/50 transition-all duration-200 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 [-webkit-tap-highlight-color:transparent]"
    >
      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-[15px] font-display font-semibold text-text tracking-tight leading-snug line-clamp-2">{instance.title}</p>
        <p className="text-[11px] font-medium text-text-muted">
          {RECURRENCE_LABEL[instance.recurrence]} · {formatDateShort(instance.periodStart)} – {formatDateShort(instance.periodEnd)}
          {!isComplete && deadlineTime && <> · Due {deadlineTime}</>}
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusChip status={isComplete ? 'completed' : overdue ? 'overdue' : 'due'} />
        {showVerification && (
          <IconChip icon={verification.icon} tone={verification.tone} label={VERIFICATION_STATUS_LABEL[instance.verificationStatus]} />
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="h-1.5 flex-1 bg-surface-hover rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${instanceProgressBarClass(overdue, isComplete)}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* Percent first and coloured by state (done green, overdue red, else neutral), the item
            count beside it for the detail. */}
        <span className="flex items-baseline gap-1.5 shrink-0 tabular-nums">
          <span className={`text-sm font-display font-bold ${instanceProgressToneClass(overdue, isComplete)}`}>{progress}%</span>
          <span className="text-[11px] text-text-muted font-medium">{done}/{total}</span>
        </span>
      </div>
      {compliance !== null && (
        <p className="text-[11px] font-medium text-text-muted">
          Compliance <span className={`font-display font-bold tabular-nums ${complianceToneClass(compliance)}`}>{compliance}%</span>
        </p>
      )}
    </Link>
  );
};
