import { memo } from 'react';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import { StatusChip, PriorityChip, DepartmentChip, TagChip } from '../../components';
import { PRIORITY_CONFIG, formatDueLabel, formatShortDateTime } from './ticketDisplay';
import type { StatusChipStatus } from '../../components/statusChip';
import type { Ticket } from '../../api/ticket';

interface TicketTableProps {
  tickets: Ticket[];
  departmentNames: Map<string, string>;
  storeNames: Map<string, string>;
  categoryNames: Map<string, string>;
  assigneeNames: Map<string, string>;
  onOpen: (ticket: Ticket) => void;
}

const HEAD_ROW_CLASS = 'bg-primary-800';
const HEAD_CLASS = 'px-3 py-3 text-left t-meta font-semibold text-white tracking-tight whitespace-nowrap';
const CELL_CLASS = 'px-3 py-2.5 pointer-coarse:py-3 align-middle t-meta text-text-secondary';

const FROM_LG = 'hidden lg:table-cell';
const FROM_XL = 'hidden xl:table-cell';
const FROM_2XL = 'hidden 2xl:table-cell';

const TicketTableComponent = ({ tickets, departmentNames, storeNames, categoryNames, assigneeNames, onOpen }: TicketTableProps) => {

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[36rem] md:min-w-[40rem] lg:min-w-[44rem] xl:min-w-[58rem] 2xl:min-w-[64rem] border-collapse">
        <thead className={HEAD_ROW_CLASS}>
          <tr>
            <th scope="col" className={`${HEAD_CLASS} sticky left-0 ${HEAD_ROW_CLASS} z-10`}>Ticket</th>
            <th scope="col" className={HEAD_CLASS}>Status</th>
            <th scope="col" className={HEAD_CLASS}>Priority</th>
            <th scope="col" className={`${HEAD_CLASS} ${FROM_LG}`}>Department</th>
            <th scope="col" className={`${HEAD_CLASS} ${FROM_2XL}`}>Store</th>
            <th scope="col" className={`${HEAD_CLASS} ${FROM_XL}`}>Category</th>
            <th scope="col" className={HEAD_CLASS}>Assignee</th>
            <th scope="col" className={`${HEAD_CLASS} ${FROM_2XL}`}>Raised by</th>
            <th scope="col" className={HEAD_CLASS}>TAT Due</th>
            <th scope="col" className={`${HEAD_CLASS} ${FROM_XL}`}>Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => {
            const due = formatDueLabel(ticket);
            const department = ticket.departmentId ? departmentNames.get(ticket.departmentId) : undefined;
            const store = ticket.storeId ? storeNames.get(ticket.storeId) : undefined;
            const category = ticket.categoryId ? categoryNames.get(ticket.categoryId) : undefined;
            const raisedBy = assigneeNames.get(ticket.userId);
            const statusChipStatus = ticket.status.toLowerCase() as StatusChipStatus;
            const statusLabel = getTicketStatusLabel(ticket.status);

            return (
              <tr
                key={ticket.id}
                onClick={() => onOpen(ticket)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(ticket);
                  }
                }}
                className="group border-b border-border/40 last:border-b-0 hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60 focus-visible:outline-none transition-colors duration-200 ease-in-out cursor-pointer"
              >
                <td className={`${CELL_CLASS} sticky left-0 bg-surface group-hover:bg-surface-hover group-focus-visible:bg-surface-hover transition-colors duration-200 z-10 min-w-44 max-w-56 sm:max-w-72 xl:max-w-md`}>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-semibold text-text-secondary leading-snug line-clamp-2 break-words">{ticket.title}</span>
                    {ticket.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {ticket.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
                      </div>
                    )}
                  </div>
                </td>

                <td className={CELL_CLASS}>
                  <StatusChip status={statusChipStatus} label={statusLabel} />
                </td>

                <td className={CELL_CLASS}>
                  <PriorityChip meta={PRIORITY_CONFIG[ticket.priority]} />
                </td>

                <td className={`${CELL_CLASS} ${FROM_LG}`}>
                  {department ? <DepartmentChip name={department} /> : <span className="text-text-light">Not set</span>}
                </td>

                <td className={`${CELL_CLASS} ${FROM_2XL} whitespace-nowrap`}>
                  {store ?? <span className="text-text-light">Not set</span>}
                </td>

                <td className={`${CELL_CLASS} ${FROM_XL} whitespace-nowrap`}>
                  {category ?? <span className="text-text-light">Not set</span>}
                </td>

                <td className={`${CELL_CLASS} whitespace-nowrap`}>
                  {ticket.assignee ? ticket.assignee.firstName : <span className="text-text-light">Nobody yet</span>}
                </td>

                <td className={`${CELL_CLASS} ${FROM_2XL} whitespace-nowrap`}>
                  {raisedBy ?? <span className="text-text-light">Not set</span>}
                </td>

                <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
                  {due ? (
                    <span className={due.overdue ? 'text-danger font-semibold' : undefined}>
                      {due.label}
                    </span>
                  ) : (
                    <span className="text-text-light">Not set</span>
                  )}
                </td>

                <td className={`${CELL_CLASS} ${FROM_XL} whitespace-nowrap tabular-nums text-text-muted`}>
                  {formatShortDateTime(ticket.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="sr-only" aria-live="polite">{tickets.length} tickets, sorted.</p>
    </div>
  );
};

export const TicketTable = memo(TicketTableComponent);
