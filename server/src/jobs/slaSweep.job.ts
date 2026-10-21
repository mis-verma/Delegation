import { scheduleJob } from '../utils/jobTracker.js';
import { and, asc, eq, lt, ne, inArray, isNull } from 'drizzle-orm';
import { db } from '../config/db.js';
import { tickets } from '../db/schema/index.js';

const SLA_SWEEP_BATCH_SIZE = 500;
import { emitTicketEvent } from '../sockets/ticketEvent.js';

export const startSlaSweep = () => {
  let isRunning = false;

  scheduleJob("ticket-sla-sweep", '*/5 * * * *', 5, async () => {
    if (isRunning) {
      console.warn('SLA sweep: previous run still in progress, skipping this tick.');
      return;
    }
    isRunning = true;
    try {
      const overdue = await db.select().from(tickets).where(and(
        lt(tickets.tatDueAt, new Date()),
        eq(tickets.isOverdue, false),
        eq(tickets.awaitingHeadApproval, false),
        ne(tickets.status, 'CLOSED'),
        ne(tickets.status, 'PENDING_APPROVAL'),
        isNull(tickets.deletedAt),
      )).orderBy(asc(tickets.tatDueAt)).limit(SLA_SWEEP_BATCH_SIZE);

      if (!overdue.length) return;

      if (overdue.length === SLA_SWEEP_BATCH_SIZE) {
        console.warn(`SLA sweep: hit the ${SLA_SWEEP_BATCH_SIZE}-ticket batch cap — there may be more overdue tickets still waiting; they'll be picked up on the next tick.`);
      }

      await db.update(tickets)
        .set({ isOverdue: true, updatedAt: new Date() })
        .where(inArray(tickets.id, overdue.map((ticket) => ticket.id)));

      for (const ticket of overdue) {
        emitTicketEvent('ticket:overdue', {
          userId:       ticket.userId,
          assigneeId:   ticket.assigneeId ?? null,
          departmentId: ticket.departmentId ?? null,
          storeId:      ticket.storeId ?? null,
        }, { id: ticket.id, tatDueAt: ticket.tatDueAt });
      }

      console.log(`SLA sweep: flagged ${overdue.length} ticket(s) as overdue`);
    } catch (err) {
      console.error('SLA sweep failed:', err);
    } finally {
      isRunning = false;
    }
  });
};
