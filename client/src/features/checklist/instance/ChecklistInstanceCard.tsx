import { memo, useMemo } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { ChecklistProgressBar, ENTITY_CARD_CLASS, IconChip, StatusChip } from '../../../components';
import {
  complianceToneClass,
  formatDateShort,
  getInstanceView,
  instanceProgressToneClass,
  RECURRENCE_LABEL,
} from '../checklistDisplay';
import { useAuth } from '../../../context/AuthContext';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface ChecklistInstanceCardProps {
  instance: ChecklistInstance;
}

// Memoized: MyChecklists re-renders on every filter/sort/option change and the list can run to 50
// cards, all of which keep the same `instance` object between those renders.
export const ChecklistInstanceCard = memo(({ instance }: ChecklistInstanceCardProps) => {
  const { done, total, progress, isComplete, overdue, chipStatus, compliance, deadlineTime, verification } = getInstanceView(instance);
  const showVerification = isComplete || instance.verificationStatus !== 'NOT_SUBMITTED';
  const { user } = useAuth();
  // A shared checklist is done once ONE assignee finishes it. If that was someone else, say so, so
  // this person does not think they still have to fill it.
  const doneByOthers = useMemo(() => {
    if (!isComplete || !user) return null;
    const names = new Set<string>();
    for (const item of instance.items) {
      if (item.completedBy === user.id) return null;
      if (item.completedByName) names.add(item.completedByName);
    }
    return names.size ? [...names].slice(0, 2).join(' and ') : null;
  }, [isComplete, user, instance.items]);

  return (
    <Link
      to={`/checklists/${instance.id}`}
      className={cn(ENTITY_CARD_CLASS, 'justify-start gap-2.5 p-3.5 sm:p-3.5 active:bg-surface-hover/50 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 [-webkit-tap-highlight-color:transparent]')}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-[15px] font-display font-semibold text-text tracking-tight leading-snug line-clamp-2">{instance.title}</p>
        <p className="text-[11px] font-medium text-text-muted">
          {RECURRENCE_LABEL[instance.recurrence]} · {formatDateShort(instance.periodStart)} – {formatDateShort(instance.periodEnd)}
          {!isComplete && deadlineTime && <> · Due {deadlineTime}</>}
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusChip status={chipStatus} />
        {showVerification && (
          <IconChip icon={verification.icon} tone={verification.tone} label={verification.label} />
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {total > 0 ? (
          <ChecklistProgressBar done={done} total={total} tone={overdue ? 'danger' : 'auto'} bare thin />
        ) : (
          <span className="flex-1" />
        )}
        {/* Percent first and coloured by state (done green, overdue red, else neutral), the item
            count beside it for the detail. */}
        <span className="flex items-baseline gap-1.5 shrink-0 tabular-nums">
          <span className={`text-sm font-display font-bold ${instanceProgressToneClass(overdue, isComplete)}`}>{progress}%</span>
          <span className="text-[11px] text-text-muted font-medium">{done}/{total}</span>
        </span>
      </div>
      {doneByOthers && (
        <p className="text-[11px] font-medium text-text-muted">Done by {doneByOthers}. You do not need to fill it.</p>
      )}
      {compliance !== null && (
        <p className="text-[11px] font-medium text-text-muted">
          Compliance <span className={`font-display font-bold tabular-nums ${complianceToneClass(compliance)}`}>{compliance}%</span>
        </p>
      )}
    </Link>
  );
});
ChecklistInstanceCard.displayName = 'ChecklistInstanceCard';
