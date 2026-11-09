import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import { scheduleJob } from '../utils/jobTracker.js';
import { db } from '../config/db.js';
import { tickets } from '../db/schema/index.js';
import { auditService } from '../modules/audit/audit.service.js';
import { emitTicketEvent } from '../sockets/ticketEvent.js';
import { notificationService, notifySafely } from '../modules/notifications/notification.service.js';
import { getPopulatedTicket } from '../modules/tickets/ticketRelations.js';
import { dropTicketSummaries } from '../modules/tickets/ticketReports.js';

export const AUTO_CLOSE_AFTER_DAYS = 3;
const BATCH_SIZE = 200;
const DAY_MS = 86_400_000;

export const autoCloseCutoff = (now: Date, days = AUTO_CLOSE_AFTER_DAYS): Date => new Date(now.getTime() - days * DAY_MS);

export const autoCloseNote = (days = AUTO_CLOSE_AFTER_DAYS): string =>
  `Closed automatically. Nobody approved it within ${days} days.`;

export const closeStaleApprovals = async (now: Date = new Date()): Promise<number> => {
  const handedIn = sql`COALESCE(${tickets.submittedAt}, ${tickets.updatedAt})`;
  const clockStart = sql`GREATEST(${handedIn}, COALESCE(${tickets.autoCloseFrom}, ${handedIn}))`;
  const stale = await db.select().from(tickets).where(and(
    eq(tickets.status, 'PENDING_APPROVAL'),
    isNull(tickets.deletedAt),
    lte(clockStart, autoCloseCutoff(now)),
  )).orderBy(asc(clockStart)).limit(BATCH_SIZE);

  if (!stale.length) return 0;
  if (stale.length === BATCH_SIZE) {
    console.warn(`Ticket auto-close: hit the ${BATCH_SIZE}-ticket batch cap, the rest close on the next run.`);
  }

  const note = autoCloseNote();
  let closed = 0;
  for (const ticket of stale) {
    const [result] = await db.update(tickets).set({
      status: 'CLOSED',
      closedAt: now,
      verifiedAt: now,
      verifiedBy: null,
      verificationNote: note,
      autoClosedAt: now,
      approvalStage: null,
      updatedAt: now,
    }).where(and(
      eq(tickets.id, ticket.id),
      eq(tickets.status, 'PENDING_APPROVAL'),
      eq(tickets.updatedAt, ticket.updatedAt),
      isNull(tickets.deletedAt),
    ));
    if (result.affectedRows === 0) continue;
    closed += 1;

    const [afterRow] = await db.select().from(tickets).where(eq(tickets.id, ticket.id)).limit(1);
    await auditService.record({
      entityType: 'Ticket',
      entityId: ticket.id,
      action: 'UPDATE',
      actorId: 'system',
      source: 'SYSTEM',
      before: ticket,
      after: afterRow,
    });

    const populated = await getPopulatedTicket(ticket.id);
    emitTicketEvent('ticket:updated', {
      userId: ticket.userId,
      assigneeId: ticket.assigneeId ?? null,
      departmentId: ticket.departmentId ?? null,
      storeId: ticket.storeId ?? null,
    }, populated);
    await notifySafely(() => notificationService.notifyTicketAutoClosed({
      _id: ticket.id,
      title: ticket.title,
      userId: ticket.userId,
      assigneeId: ticket.assigneeId,
    }, AUTO_CLOSE_AFTER_DAYS));
  }

  if (closed > 0) {
    await dropTicketSummaries();
    console.log(`Ticket auto-close: closed ${closed} ticket(s) waiting over ${AUTO_CLOSE_AFTER_DAYS} days for approval`);
  }
  return closed;
};

export const startTicketAutoClose = () => {
  scheduleJob('ticket-auto-close', '23 * * * *', 60, () => closeStaleApprovals());
};
