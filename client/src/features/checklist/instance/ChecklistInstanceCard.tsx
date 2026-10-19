import { Clock } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { ENTITY_CARD_CLASS, IconChip, StatusChip } from '../../../components';
import {
  complianceToneClass,
  getInstanceView,
  instanceProgressToneClass,
  RECURRENCE_LABEL, formatPeriodSpan } from '../checklistDisplay';
import { useAuth } from '../../../context/AuthContext';
import type { ChecklistInstance } from '../../../api/checklistInstances';

const Metric = ({ label, value, sub, pct, bar, text }: { label: string; value: string; sub?: string; pct: number; bar: string; text: string }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <div className="flex items-baseline justify-between gap-2">
      <span className="t-meta font-medium text-text-muted">{label}</span>
      <span className="flex items-baseline gap-1 tabular-nums">
        <span className={cn('t-meta font-display font-bold', text)}>{value}</span>
        {sub && <span className="t-meta text-text-muted">{sub}</span>}
      </span>
    </div>
    <span className="h-1 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
      <span className={cn('block h-full rounded-full transition-[width] duration-500 ease-out', bar)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  </div>
);

const complianceBar = (v: number) => (v >= 90 ? 'bg-success' : v >= 70 ? 'bg-warning' : 'bg-danger');

interface ChecklistInstanceCardProps {
  instance: ChecklistInstance;
}

export const ChecklistInstanceCard = memo(({ instance }: ChecklistInstanceCardProps) => {
  const { done, total, progress, isComplete, overdue, chipStatus, compliance, deadlineTime, verification, doneLate } = getInstanceView(instance);
  const showVerification = isComplete || instance.verificationStatus !== 'NOT_SUBMITTED';
  const { user } = useAuth();
  const doneByOthers = (() => {
    if (!isComplete || !user) return null;
    const names = new Set<string>();
    for (const item of instance.items) {
      if (item.completedBy === user.id) return null;
      if (item.completedByName) names.add(item.completedByName);
    }
    return names.size ? [...names].slice(0, 2).join(' and ') : null;
  })();

  return (
    <Link
      to={`/checklists/${instance.id}`}
      className={cn(ENTITY_CARD_CLASS, 'justify-start gap-2.5 p-3 sm:p-4 active:bg-surface-hover/50 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 [-webkit-tap-highlight-color:transparent]')}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <p className="t-meta sm:t-card font-display font-semibold text-text leading-snug line-clamp-2">{instance.title}</p>
        <p className="t-meta font-medium text-text-muted">
          {RECURRENCE_LABEL[instance.recurrence]} · {formatPeriodSpan(instance, true)}
          {!isComplete && deadlineTime && <> · Due {deadlineTime}</>}
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusChip status={chipStatus} />
        {doneLate && <IconChip icon={Clock} tone="bg-warning" label="Done late" />}
        {showVerification && (
          <IconChip icon={verification.icon} tone={verification.tone} label={verification.label} />
        )}
      </div>

      {doneByOthers && (
        <p className="t-meta font-medium text-text-muted">Done by {doneByOthers}. You do not need to fill it.</p>
      )}

      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border/50 pt-2.5">
        <Metric
          label="Done"
          value={`${progress}%`}
          sub={total > 0 ? `${done}/${total}` : undefined}
          pct={progress}
          bar={overdue ? 'bg-danger' : isComplete ? 'bg-success' : 'bg-linear-to-r from-primary-400 to-primary-600'}
          text={instanceProgressToneClass(overdue, isComplete)}
        />
        <Metric
          label="Compliance"
          value={compliance === null ? '-' : `${compliance}%`}
          sub={compliance === null ? 'Not scored' : undefined}
          pct={compliance ?? 0}
          bar={compliance === null ? 'bg-border-hover' : complianceBar(compliance)}
          text={compliance === null ? 'text-text-light' : complianceToneClass(compliance)}
        />
      </div>
    </Link>
  );
});
ChecklistInstanceCard.displayName = 'ChecklistInstanceCard';
