// node-cron lets us run a function automatically on a repeating schedule,
// kind of like a built-in alarm clock for our server code.
import { scheduleJob } from '../utils/jobTracker.js';
import { and, asc, eq, lt, ne, inArray, isNull } from 'drizzle-orm';
import { db } from '../config/db.js';
import { tickets } from '../db/schema/index.js';

// Caps how many newly-overdue tickets get processed in a single 5-minute tick. Without this, a
// large backlog (e.g. after an outage, or just at scale) would load every matching row into
// memory in one pass. Ordered oldest-deadline-first so, if the cap is ever hit, the most overdue
// tickets get flagged first and the remainder simply gets picked up on the next tick.
const SLA_SWEEP_BATCH_SIZE = 500;
// A helper that broadcasts real-time events (over sockets) to connected
// clients, so the frontend can update instantly without refreshing.
import { emitTicketEvent } from '../sockets/ticketEvent.js';



// startSlaSweep sets up (but does not immediately run) a recurring background
// job. "SLA" here means "Service Level Agreement" - basically a promise that
// a ticket will be handled by a certain deadline (tatDueAt = "Turn-Around-Time
// Due At"). This function just registers the schedule; call it once when the
// server starts up.
export const startSlaSweep = () => {
  // node-cron fires on its timer regardless of whether the previous tick's callback has
  // resolved — this run's own UPDATE happens right after its SELECT (a much smaller window than
  // taskDeadlineReminder's), but at scale (a large overdue backlog, a slow DB round-trip) a still-
  // running tick could still overlap the next one and re-flag/re-emit the same tickets. This flag
  // makes the two ticks mutually exclusive instead.
  let isRunning = false;

  // cron.schedule takes a "cron expression" (a 5-part time pattern) and a
  // callback to run each time that pattern matches. The pattern here is
  // '*/5 * * * *', which in plain English means: "every 5 minutes, every
  // hour, every day, every month, every day of the week" - i.e. this job
  // wakes up and runs once every 5 minutes, forever, for as long as the
  // server process is alive.
  scheduleJob("ticket-sla-sweep", '*/5 * * * *', 5, async () => {
    if (isRunning) {
      console.warn('SLA sweep: previous run still in progress, skipping this tick.');
      return;
    }
    isRunning = true;
    // Wrapped in try/catch because this callback runs unattended on a timer -
    // nobody is watching a request/response to surface a thrown error, so
    // without this the whole sweep would silently die (or crash the process
    // via an unhandled rejection) the moment a single DB call hiccups.
    try {
      // Every time the cron job fires, look in the database for tickets that
      // have "gone overdue" since we last checked. We can't just check this
      // when someone loads a ticket, because if nobody looks at a ticket, it
      // would never get flagged as overdue - and nobody would get notified.
      // Running this sweep in the background guarantees overdue tickets get
      // caught (and their assignees notified) even if no one is actively
      // viewing them.
      const overdue = await db.select().from(tickets).where(and(
        // tatDueAt is the deadline timestamp; lt() means "less than", so this
        // matches tickets whose deadline is earlier than right now (i.e. the
        // deadline has already passed).
        lt(tickets.tatDueAt, new Date()),
        // Only grab tickets we haven't already flagged as overdue, so we don't
        // redo work or spam extra notifications for the same ticket every 5
        // minutes.
        eq(tickets.isOverdue, false),
        // ne() means "not equal" - skip tickets that are already CLOSED, since
        // a closed ticket doesn't need to be marked overdue anymore.
        ne(tickets.status, 'CLOSED'),
        // Work finished and waiting on PC's approval: the assignee's clock has stopped, so the
        // wait for a decision must not turn a ticket completed in time into a "Delayed" one. A
        // ticket that was already late when it was completed keeps the flag (set while it was
        // still In Progress), which is exactly what PC should see at the approval step.
        ne(tickets.status, 'PENDING_APPROVAL'),
        // Skip soft-deleted tickets — otherwise a deleted ticket would keep getting flagged
        // overdue and re-notified forever, since deleting it never touches tatDueAt/isOverdue.
        isNull(tickets.deletedAt),
      )).orderBy(asc(tickets.tatDueAt)).limit(SLA_SWEEP_BATCH_SIZE);

      if (!overdue.length) return;

      if (overdue.length === SLA_SWEEP_BATCH_SIZE) {
        console.warn(`SLA sweep: hit the ${SLA_SWEEP_BATCH_SIZE}-ticket batch cap — there may be more overdue tickets still waiting; they'll be picked up on the next tick.`);
      }

      // Flag every overdue ticket as overdue in a single bulk update instead
      // of one save() per ticket - one round-trip to the database no matter
      // how many tickets went overdue this sweep, instead of N.
      await db.update(tickets)
        .set({ isOverdue: true, updatedAt: new Date() })
        .where(inArray(tickets.id, overdue.map((ticket) => ticket.id)));

      // Still loop per-ticket here, but only to emit each one's socket event -
      // that has to happen individually since each ticket routes to a
      // different set of rooms (its own user/assignee/department/store).
      for (const ticket of overdue) {
        // Tell any connected clients (via websockets) that this ticket just
        // became overdue, so the UI can update live and/or show a
        // notification. We pass along the relevant user/assignee/department/
        // store IDs so the event can be routed to the right people.
        emitTicketEvent('ticket:overdue', {
          userId:       ticket.userId,
          // ?? null: if there's no assignee, don't crash - just send null
          // instead of an id.
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
