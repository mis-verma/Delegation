import { Link } from 'react-router';
import { StatusChip, type StatusChipStatus } from '../../../components';
import { Badge } from '@/components/ui/badge';
import { formatDateShort, formatDeadlineTime, RECURRENCE_LABEL, VERIFICATION_STATUS_LABEL, VERIFICATION_BADGE_VARIANT, isInstanceOverdue } from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface ChecklistInstanceTableProps {
  instances: ChecklistInstance[];
  storeNameById: Map<string, string>;
  peopleNameById: Map<string, string>;
}

// Solid navy header + dense rows, same treatment as TicketTable/TaskTable — the Table-view
// sibling of MyChecklists' grouped card grid. Flat and already-sorted (no re-grouping here),
// same convention as TicketTable receiving its rows pre-scoped from TicketList.
const HEAD_ROW_CLASS = 'bg-primary-800';
const HEAD_CLASS = 'px-3 py-3 text-left text-xs font-semibold text-white tracking-tight whitespace-nowrap';
const CELL_CLASS = 'px-3 py-2.5 align-middle text-xs text-text-secondary';

export const ChecklistInstanceTable = ({ instances, storeNameById, peopleNameById }: ChecklistInstanceTableProps) => {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border/60">
      {/* table-layout: fixed makes the max-w-[*] caps on the title/assignees cells below actually
          bound the column widths (auto layout sizes columns from content first, so a long title
          or assignee list would otherwise just widen the column instead of truncating) — paired
          with a colgroup so every column gets an explicit share instead of the equal-width
          default fixed layout falls back to when no widths are specified anywhere. */}
      <table className="w-full min-w-[60rem] border-collapse table-fixed">
        {/* Verification sits right after Status (same slot TicketTable gives Priority — the
            second-most-actionable field, the one that actually needs an admin decision) instead
            of at the far end past the horizontal scroll; Recurrence (static scheduling metadata
            nobody acts on) moved down to make room. */}
        <colgroup>
          <col className="w-[20rem]" />
          <col className="w-[7rem]" />
          <col className="w-[8rem]" />
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
            const total = instance.items.length;
            const done = instance.items.filter((i) => i.isDone).length;
            const isComplete = total > 0 && done === total;
            const overdue = isInstanceOverdue(instance, isComplete);
            const statusChipStatus: StatusChipStatus = isComplete ? 'completed' : overdue ? 'overdue' : 'due';
            const store = instance.storeId ? storeNameById.get(instance.storeId) : undefined;
            const assigneeNames = instance.assigneeIds.map((id) => peopleNameById.get(id)).filter(Boolean) as string[];

            return (
              <tr key={instance.id} className="border-b border-border/40 last:border-b-0 hover:bg-surface-hover/60 transition-colors duration-200 ease-in-out">
                <td className={`${CELL_CLASS} sticky left-0 bg-surface z-10 max-w-[20rem]`}>
                  <Link to={`/checklists/${instance.id}`} className="font-semibold text-text-secondary hover:text-primary-600 dark:hover:text-primary-400 truncate block transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-sm">
                    {instance.title}
                  </Link>
                </td>

                <td className={CELL_CLASS}>
                  <StatusChip status={statusChipStatus} />
                </td>

                <td className={CELL_CLASS}>
                  <Badge variant={VERIFICATION_BADGE_VARIANT[instance.verificationStatus]}>
                    {VERIFICATION_STATUS_LABEL[instance.verificationStatus]}
                  </Badge>
                </td>

                <td className={`${CELL_CLASS} whitespace-nowrap`}>
                  {store ?? <span className="text-text-light">—</span>}
                </td>

                <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
                  {formatDateShort(instance.periodStart)} – {formatDateShort(instance.periodEnd)}
                  {!isComplete && formatDeadlineTime(instance) && (
                    <span className="block text-text-light">Due {formatDeadlineTime(instance)}</span>
                  )}
                </td>

                <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
                  {done}/{total}
                </td>

                <td className={`${CELL_CLASS} max-w-[14rem]`}>
                  {assigneeNames.length ? (
                    <span className="truncate block">{assigneeNames.join(', ')}</span>
                  ) : (
                    <span className="text-text-light">Unassigned</span>
                  )}
                </td>

                <td className={`${CELL_CLASS} whitespace-nowrap`}>
                  {RECURRENCE_LABEL[instance.recurrence]}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="sr-only" aria-live="polite">{instances.length} checklists, sorted.</p>
    </div>
  );
};
