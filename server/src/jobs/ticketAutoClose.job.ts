import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import { scheduleJob } from '../utils/jobTracker.js';
import { db } from '../config/db.js';
import { tickets } from '../db/schema/index.js';
import { auditService } from '../modules/audit/audit.service.js';
import { emitTicketEvent } from '../sockets/ticketEvent.js';
import { notificationService, notifySafely } from '../modules/notifications/notification.service.js';
import { getPopulatedTicket } from '../modules/tickets/ticketRelations.js';
import { dropTicketSummaries } from '../modules/tickets/ticketReports.js';
import { settingsService } from '../modules/settings/settings.service.js';
import { autoCloseCutoff, autoCloseDaysFrom, autoCloseNote, dayCount } from './autoCloseRules.js';

const BATCH_SIZE = 200;

export const configuredAutoCloseDays = (): number | null => autoCloseDaysFrom(settingsService.getCached().autoCloseDays);

export const closeStaleApprovals = async (now: Date = new Date(), days: number | null = configuredAutoCloseDays()): Promise<number> => {
  if (!days) return 0;
  const handedIn = sql`COALESCE(${tickets.submittedAt}, ${tickets.updatedAt})`;
  const clockStart = sql`GREATEST(${handedIn}, COALESCE(${tickets.autoCloseFrom}, ${handedIn}))`;
  const stale = await db.select().from(tickets).where(and(
    eq(tickets.status, 'PENDING_APPROVAL'),
    isNull(tickets.deletedAt),
    lte(clockStart, autoCloseCutoff(now, days)),
  )).orderBy(asc(clockStart)).limit(BATCH_SIZE);

  if (!stale.length) return 0;
  if (stale.length === BATCH_SIZE) {
    console.warn(`Ticket auto-close: hit the ${BATCH_SIZE}-ticket batch cap, the rest close on the next run.`);
  }

  const note = autoCloseNote(days);
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
    }, days));
  }

  if (closed > 0) {
    await dropTicketSummaries();
    console.log(`Ticket auto-close: closed ${closed} ticket(s) waiting over ${dayCount(days)} for approval`);
  }
  return closed;
};

export const startTicketAutoClose = () => {
  scheduleJob('ticket-auto-close', '23 * * * *', 60, () => closeStaleApprovals());
};
