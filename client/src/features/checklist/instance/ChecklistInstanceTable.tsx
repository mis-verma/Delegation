import { memo, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlarmClock, AlarmClockOff, CalendarClock, Clock } from 'lucide-react';
import { IconChip, Skeleton, StatusChip } from '../../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TD_STICKY_CLASS, NUM_CLASS } from '../../../components/dataTable';
import { cn } from '@/lib/utils';
import {
  getInstanceView, formatClockTime,
  RECURRENCE_LABEL, formatPeriodSpan } from '../checklistDisplay';
import { useSharedNow } from '../../../lib/useSharedNow';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface ChecklistInstanceTableProps {
  instances: ChecklistInstance[];
  storeNameById: Map<string, string>;
  peopleNameById: Map<string, string>;
  lookupsPending?: boolean;
}

const HEAD_CLASS = TH_CLASS;
const CELL_CLASS = cn(TD_CLASS, 'transition-colors duration-200 ease-out group-hover:bg-surface-hover group-focus-within:bg-surface-hover');

interface TableRowProps {
  instance: ChecklistInstance;
  storeName: string | undefined;
  assignees: string;
  assigneeCount: number;
  storePending: boolean;
  assigneesPending: boolean;
}

const TableRow = memo(({ instance, storeName, assignees, assigneeCount, storePending, assigneesPending }: TableRowProps) => {
  const navigate = useNavigate();
  const now = useSharedNow();
  const { done, total, isComplete, chipStatus, deadlineTime, verification, doneLate, inLateWindow, closed, closedAt, opensOn } = getInstanceView(instance, now);
  const href = `/checklists/${instance.id}`;

  const onRowClick = (e: MouseEvent<HTMLTableRowElement>) => {
    if (e.defaultPrevented) return;
    navigate(href);
  };

  return (
    <tr onClick={onRowClick} className="group cursor-pointer border-b border-border/40 last:border-b-0">
      <td className={cn(CELL_CLASS, TD_STICKY_CLASS, 'group-focus-within:bg-surface-hover')}>
        <Link to={href} className="t-card font-display font-semibold text-text group-hover:text-primary-600 dark:group-hover:text-primary-400 line-clamp-2 leading-snug break-words transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-sm">
          {instance.title}
        </Link>
      </td>

      <td className={CELL_CLASS}>
        <div className="flex flex-wrap items-center gap-1.5">
          {!closed && <StatusChip status={chipStatus} />}
          {opensOn && <IconChip icon={CalendarClock} tone="bg-primary-600" label={`Opens ${opensOn}`} />}
          {closed && <IconChip icon={AlarmClockOff} tone="bg-danger" label={closedAt ? `Missed, closed ${closedAt}` : 'Missed'} />}
          {inLateWindow && instance.lateUntilTime && <IconChip icon={AlarmClock} tone="bg-danger" label={`Fill by ${formatClockTime(instance.lateUntilTime)}`} />}
          {doneLate && <IconChip icon={Clock} tone="bg-warning" label="Done late" />}
        </div>
      </td>

      <td className={CELL_CLASS}>
        <IconChip icon={verification.icon} tone={verification.tone} label={verification.label} />
      </td>

      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        {storePending ? <Skeleton className="h-3 w-16" /> : (storeName ?? <span className="text-text-light">No store</span>)}
      </td>

      <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
        {formatPeriodSpan(instance, true)}
        {!isComplete && deadlineTime && (
          <span className="block text-text-light">Due {deadlineTime}</span>
        )}
      </td>

      <td className={cn(CELL_CLASS, 'whitespace-nowrap', NUM_CLASS)}>
        {done}/{total}
      </td>

      <td className={`${CELL_CLASS} max-w-[14rem]`}>
        {assigneesPending ? (
          <Skeleton className="h-3 w-24" />
        ) : assignees ? (
          <span className="truncate block">{assignees}</span>
        ) : assigneeCount > 0 ? (
          <span className="text-text-light">{assigneeCount} assigned</span>
        ) : (
          <span className="text-text-light">Unassigned</span>
        )}
      </td>

      <td className={`${CELL_CLASS} whitespace-nowrap`}>
        {RECURRENCE_LABEL[instance.recurrence]}
      </td>
    </tr>
  );
});
TableRow.displayName = 'ChecklistInstanceTableRow';

export const ChecklistInstanceTable = ({ instances, storeNameById, peopleNameById, lookupsPending = false }: ChecklistInstanceTableProps) => {
  return (
    <div className={TABLE_FRAME_CLASS}>
      <table className="w-full min-w-[64rem] border-collapse table-fixed">
        <caption className="sr-only">{instances.length} {instances.length === 1 ? 'checklist' : 'checklists'}</caption>
        <colgroup>
          <col className="w-[20rem]" />
          <col className="w-[11rem]" />
          <col className="w-[10rem]" />
          <col className="w-[8rem]" />
          <col className="w-[11rem]" />
          <col className="w-[6rem]" />
          <col className="w-[14rem]" />
          <col className="w-[7rem]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD_CLASS, TH_CORNER_CLASS)}>Checklist</th>
            <th scope="col" className={HEAD_CLASS}>Status</th>
            <th scope="col" className={HEAD_CLASS}>Verification</th>
            <th scope="col" className={HEAD_CLASS}>Store</th>
            <th scope="col" className={HEAD_CLASS}>Period</th>
            <th scope="col" className={cn(HEAD_CLASS, 'text-right')}>Progress</th>
            <th scope="col" className={HEAD_CLASS}>Assignees</th>
            <th scope="col" className={HEAD_CLASS}>Recurrence</th>
          </tr>
        </thead>
        <tbody>
          {instances.map((instance) => {
            const storeName = instance.storeId ? storeNameById.get(instance.storeId) : undefined;
            const assignees = instance.assigneeIds.map((id) => peopleNameById.get(id)).filter(Boolean).join(', ');
            return (
              <TableRow
                key={instance.id}
                instance={instance}
                storeName={storeName}
                assignees={assignees}
                assigneeCount={instance.assigneeIds.length}
                storePending={lookupsPending && !!instance.storeId && !storeName}
                assigneesPending={lookupsPending && instance.assigneeIds.length > 0 && !assignees}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
