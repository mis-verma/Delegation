import { memo } from 'react';
import { AlarmClock, CalendarDays } from 'lucide-react';
import { getTicketStatusLabel } from '../../lib/ticketStatusLabel';
import { Avatar, StatusChip, PriorityChip, DepartmentChip, IconChip, TagChip } from '../../components';
import { PRIORITY_CONFIG, formatDueLabel, formatShortDateTime } from './ticketDisplay';
import { TicketFlowChips } from './TicketFlowChips';
import type { StatusChipStatus } from '../../components/statusChip';
import type { Ticket } from '../../api/ticket';
import { cn } from '@/lib/utils';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TR_CLASS, TD_STICKY_CLASS, activateOnKey } from '../../components/dataTable';

interface TicketTableProps {
  tickets: Ticket[];
  departmentNames: Map<string, string>;
  storeNames: Map<string, string>;
  categoryNames: Map<string, string>;
  assigneeNames: Map<string, string>;
  onOpen: (ticket: Ticket) => void;
}

const HEAD_CLASS = TH_CLASS;
const CELL_CLASS = TD_CLASS;

const FROM_LG = 'hidden lg:table-cell';
const FROM_XL = 'hidden xl:table-cell';
const FROM_2XL = 'hidden 2xl:table-cell';

const TicketTableComponent = ({ tickets, departmentNames, storeNames, categoryNames, assigneeNames, onOpen }: TicketTableProps) => {

  return (
    <div className={TABLE_FRAME_CLASS}>
      <table className="w-full min-w-[36rem] md:min-w-[40rem] lg:min-w-[44rem] xl:min-w-[58rem] 2xl:min-w-[64rem] border-collapse">
        <caption className="sr-only">Tickets</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD_CLASS, TH_CORNER_CLASS)}>Ticket</th>
            <th scope="col" className={HEAD_CLASS}>Status</th>
            <th scope="col" className={HEAD_CLASS}>Priority</th>
            <th scope="col" className={`${HEAD_CLASS} ${FROM_LG}`}>Department</th>
            <th scope="col" className={`${HEAD_CLASS} ${FROM_2XL}`}>Store</th>
            <th scope="col" className={`${HEAD_CLASS} ${FROM_XL}`}>Category</th>
            <th scope="col" className={HEAD_CLASS}>Assignee</th>
            <th scope="col" className={`${HEAD_CLASS} ${FROM_2XL}`}>Sent by</th>
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
            const raisedBy = ticket.raisedBy ? `${ticket.raisedBy.firstName} ${ticket.raisedBy.lastName ?? ''}`.trim() : assigneeNames.get(ticket.userId);
            const statusChipStatus = (ticket.declinedAt ? 'declined' : ticket.status.toLowerCase()) as StatusChipStatus;
            const statusLabel = ticket.declinedAt ? 'Declined' : getTicketStatusLabel(ticket.status);

            return (
              <tr
                key={ticket.id}
                onClick={() => onOpen(ticket)}
                tabIndex={0}
                onKeyDown={activateOnKey(() => onOpen(ticket))}
                className={TR_CLASS}
              >
                <td className={cn(CELL_CLASS, TD_STICKY_CLASS, 'min-w-44 max-w-56 sm:max-w-72 xl:max-w-md')}>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="t-card font-display font-semibold text-text leading-snug line-clamp-2 break-words">{ticket.title}</span>
                    {ticket.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {ticket.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
                      </div>
                    )}
                  </div>
                </td>

                <td className={CELL_CLASS}>
                  <div className="flex flex-col items-start gap-1.5">
                    <StatusChip status={statusChipStatus} label={statusLabel} />
                    <TicketFlowChips ticket={ticket} />
                  </div>
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
                  {ticket.subcategory?.name && <span className="block t-meta text-text-muted line-clamp-1">{ticket.subcategory.name}</span>}
                </td>

                <td className={`${CELL_CLASS} whitespace-nowrap`}>
                  {ticket.assignee ? (
                    <span className="inline-flex items-center gap-2">
                      <Avatar name={ticket.assignee.firstName} size="xs" />
                      <span className="t-meta font-display font-semibold text-text">{ticket.assignee.firstName}</span>
                    </span>
                  ) : (
                    <span className="t-meta text-text-light">Nobody yet</span>
                  )}
                </td>

                <td className={`${CELL_CLASS} ${FROM_2XL} whitespace-nowrap`}>
                  {raisedBy ?? <span className="text-text-light">Not set</span>}
                </td>

                <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
                  {due ? (
                    <IconChip icon={due.overdue ? AlarmClock : CalendarDays} tone={due.overdue ? 'bg-danger' : 'bg-text-muted'} label={due.label} labelClassName={cn('tabular-nums', due.overdue && 'text-danger')} />
                  ) : (
                    <span className="t-meta text-text-light">Not set</span>
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

      <p className="sr-only" aria-live="polite">{tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'} shown.</p>
    </div>
  );
};

export const TicketTable = memo(TicketTableComponent);
