import { memo } from 'react';
import { Link } from 'react-router';
import { Check, Circle, ClipboardList, Store, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ChecklistProgressBar, ENTITY_CARD_CLASS, IconChip, StatusChip } from '../../../components';
import {
  formatDate,
  formatDateTime,
  getInstanceView,
  instanceProgressToneClass, formatPeriodSpan } from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface ChecklistInstanceRowProps {
  instance: ChecklistInstance;
  /**
   * Pass to render the History layout: the checklist title leads, with its store and day beneath
   * and a progress bar below. Without it this is the per-definition row (period range first),
   * used in ChecklistDefinitionDetail's To do / In progress / Completed groups. An empty string
   * means the store is still loading: the History layout renders without a store label yet.
   */
  storeName?: string;
}

const ROW_CLASS = cn(ENTITY_CARD_CLASS, 'justify-start outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40');

// One row in ChecklistDefinitionDetail's grouped instance list and in the History checklists tab.
// The row-view sibling of ChecklistInstanceCard (used by MyChecklists' grid instead).
export const ChecklistInstanceRow = memo(({ instance, storeName }: ChecklistInstanceRowProps) => {
  const { done, total, progress, isComplete, overdue, chipStatus, progressStatus, deadlineTime, verification, doneLate } = getInstanceView(instance);

  if (storeName !== undefined) {
    return (
      <Link to={`/checklists/${instance.id}`} className={cn(ROW_CLASS, 'gap-3 p-3.5 sm:p-4')}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-display font-bold text-text line-clamp-2 leading-snug">{instance.title}</p>
            <p className="flex items-center gap-2 pt-1 t-meta text-text-muted font-display flex-wrap">
              {storeName && <span className="inline-flex items-center gap-1"><Store size={11} aria-hidden />{storeName}</span>}
              <span>{formatDate(instance.periodStart)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusChip status={chipStatus} />
            {doneLate && <IconChip icon={Clock} tone="bg-warning" label="Done late" />}
            <IconChip icon={verification.icon} tone={verification.tone} label={verification.label} />
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {total > 0 ? (
            <ChecklistProgressBar done={done} total={total} tone={overdue ? 'danger' : 'auto'} bare thin />
          ) : (
            <span className="flex-1" />
          )}
          <span className={`t-meta font-display font-medium shrink-0 tabular-nums ${instanceProgressToneClass(overdue, isComplete)}`}>
            {done}/{total}
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/checklists/${instance.id}`} className={cn(ROW_CLASS, 'flex-row items-center gap-3 px-4 py-3.5 sm:p-4')}>
      {isComplete ? (
        <span className="flex items-center justify-center size-5 rounded-full bg-success text-white shrink-0">
          <Check size={12} strokeWidth={3} />
        </span>
      ) : (
        <Circle
          size={20}
          className={`shrink-0 ${progressStatus === 'IN_PROGRESS' ? 'text-warning' : 'text-text-light'}`}
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <p className="text-sm font-display font-medium text-text truncate">
          {formatPeriodSpan(instance)}
          {!isComplete && deadlineTime && <span className="text-text-muted"> · Due {deadlineTime}</span>}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 t-meta text-text-muted font-display tabular-nums">
            <ClipboardList size={11} aria-hidden /> {done}/{total}
          </span>
          <Badge variant={isComplete ? 'success' : 'warning'}>
            {isComplete ? 'Done' : `${progress}% done`}
          </Badge>
          <IconChip icon={verification.icon} tone={verification.tone} label={verification.label} />
        </div>
      </div>

      {/* This trailing slot never wraps away, unlike the chip cluster above: overdue is the one
          status a scanning admin should never miss, so it gets first claim on it. generatedAt (a
          real timestamp, rendered in the viewer's own local time zone per checklistDisplay.ts's
          convention) is the fallback when there's nothing more urgent to show. */}
      {overdue ? (
        <span className="shrink-0"><StatusChip status="overdue" /></span>
      ) : (
        <span className="t-meta text-text-muted font-display shrink-0">{formatDateTime(instance.generatedAt)}</span>
      )}
    </Link>
  );
});
ChecklistInstanceRow.displayName = 'ChecklistInstanceRow';
