import { Link } from 'react-router';
import { Check, Circle, ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusChip } from '@/components/statusChip';
import {
  formatDate,
  formatDateTime,
  formatDeadlineTime,
  instanceProgressStatus,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_BADGE_VARIANT,
  isInstanceOverdue,
} from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface ChecklistInstanceRowProps {
  instance: ChecklistInstance;
}

// One row in ChecklistDefinitionDetail's Todo/In-progress/Completed grouped instance list — the
// row-view sibling of ChecklistInstanceCard (used by MyChecklists' grid instead).
export const ChecklistInstanceRow = ({ instance }: ChecklistInstanceRowProps) => {
  const total = instance.items.length;
  const done = instance.items.filter(i => i.isDone).length;
  const status = instanceProgressStatus(done, total);
  const progress = total ? Math.round((done / total) * 100) : 0;
  const overdue = isInstanceOverdue(instance, status === 'COMPLETED');
  const deadlineTime = formatDeadlineTime(instance);

  return (
    <Link
      to={`/checklists/${instance.id}`}
      className="flex items-center gap-3 px-4 py-3.5 rounded-lg border border-border bg-surface hover:border-border-hover transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      {status === 'COMPLETED' ? (
        <span className="flex items-center justify-center size-5 rounded-full bg-success text-white shrink-0">
          <Check size={12} strokeWidth={3} />
        </span>
      ) : (
        <Circle
          size={20}
          className={`shrink-0 ${status === 'IN_PROGRESS' ? 'text-warning' : 'text-text-light'}`}
        />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-display font-medium text-text truncate">
          {formatDate(instance.periodStart)} — {formatDate(instance.periodEnd)}
          {status !== 'COMPLETED' && deadlineTime && <span className="text-text-muted"> · Due {deadlineTime}</span>}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-text-muted font-display">
            <ClipboardList size={11} /> {done}/{total}
          </span>
          <Badge variant={status === 'COMPLETED' ? 'success' : 'warning'}>
            {status === 'COMPLETED' ? 'Done' : `Mark ${progress}%`}
          </Badge>
          <Badge variant={VERIFICATION_BADGE_VARIANT[instance.verificationStatus]}>
            {VERIFICATION_STATUS_LABEL[instance.verificationStatus]}
          </Badge>
        </div>
      </div>

      {/* This trailing slot never wraps away, unlike the badge cluster above — overdue is the one
          status a scanning admin should never miss, so it gets first claim on it. generatedAt (a
          real timestamp — formatDateTime renders it in the viewer's own local time zone, matching
          checklistDisplay.ts's documented convention) is the fallback when there's nothing more
          urgent to show, not a fixture that outranks it. */}
      {overdue ? (
        <span className="shrink-0"><StatusChip status="overdue" /></span>
      ) : (
        <span className="text-xs text-text-muted font-display shrink-0">{formatDateTime(instance.generatedAt)}</span>
      )}
    </Link>
  );
};
