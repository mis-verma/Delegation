import { memo, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconChip, PANEL_CLASS, Skeleton, StatusChip } from '../../../components';
import {
  getInstanceView,
  RECURRENCE_LABEL, formatPeriodSpan } from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface ChecklistInstanceTableProps {
  instances: ChecklistInstance[];
  storeNameById: Map<string, string>;
  peopleNameById: Map<string, string>;
  lookupsPending?: boolean;
}

const HEAD_ROW_CLASS = 'bg-primary-800';
const HEAD_CLASS = 'px-3 py-3 text-left t-meta font-semibold text-white tracking-tight whitespace-nowrap';
const CELL_CLASS = 'px-3 py-2.5 align-middle t-meta text-text-secondary transition-colors duration-200 ease-in-out group-hover:bg-surface-hover';

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
  const { done, total, isComplete, chipStatus, deadlineTime, verification } = getInstanceView(instance);
  const href = `/checklists/${instance.id}`;

  const onRowClick = (e: MouseEvent<HTMLTableRowElement>) => {
    if (e.defaultPrevented) return;
    navigate(href);
  };

  return (
    <tr onClick={onRowClick} className="group cursor-pointer border-b border-border/40 last:border-b-0">
      <td className={`${CELL_CLASS} sticky left-0 bg-surface z-10 max-w-[20rem]`}>
        <Link to={href} className="font-semibold text-text-secondary group-hover:text-primary-600 dark:group-hover:text-primary-400 truncate block transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-sm">
          {instance.title}
        </Link>
      </td>

      <td className={CELL_CLASS}>
        <StatusChip status={chipStatus} />
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

      <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
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
    <div className={`${PANEL_CLASS} w-full overflow-x-auto`}>
      <table className="w-full min-w-[60rem] border-collapse table-fixed">
        <caption className="sr-only">{instances.length} {instances.length === 1 ? 'checklist' : 'checklists'}</caption>
        <colgroup>
          <col className="w-[20rem]" />
          <col className="w-[7rem]" />
          <col className="w-[10rem]" />
          <col className="w-[8rem]" />
          <col className="w-[11rem]" />
          <col className="w-[6rem]" />
          <col className="w-[14rem]" />
          <col className="w-[7rem]" />
        </colgroup>
        <thead className={HEAD_ROW_CLASS}>
          <tr>
            <th scope="col" className={`${HEAD_CLASS} sticky left-0 ${HEAD_ROW_CLASS} z-10`}>Checklist</th>
            <th scope="col" className={HEAD_CLASS}>Status</th>
            <th scope="col" className={HEAD_CLASS}>Verification</th>
            <th scope="col" className={HEAD_CLASS}>Store</th>
            <th scope="col" className={HEAD_CLASS}>Period</th>
            <th scope="col" className={HEAD_CLASS}>Progress</th>
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
