import { db } from "../../config/db.js"
import { tasks } from "../../db/schema/task.js"
import { tickets, ticketStatusUpdates } from "../../db/schema/ticket.js"
import { checklistInstances } from "../../db/schema/checklistInstance.js"
import { and, eq, gte, isNotNull, isNull, lt } from "drizzle-orm"

// The reviewer's promise: anything handed in for approval is decided within this long.
export const APPROVAL_TAT_HOURS = 24
const WINDOW_MS = APPROVAL_TAT_HOURS * 60 * 60 * 1000

export type ApprovalTatCounts = { met: number; breached: number; pending: number }

export type ApprovalTatResult = ApprovalTatCounts & {
    windowHours: number
    /** met / (met + breached) as a whole percent; null when nothing has come due yet. */
    rate: number | null
    byKind: { delegation: ApprovalTatCounts; ticket: ApprovalTatCounts; checklist: ApprovalTatCounts }
}

type HandIn = { submittedAt: Date; verifiedAt: Date | null }

const EMPTY = (): ApprovalTatCounts => ({ met: 0, breached: 0, pending: 0 })

// One hand-in, judged against the 24 hour promise:
//   decided within 24h          -> met
//   decided later               -> breached
//   still waiting past 24h      -> breached (the clock ran out with no decision)
//   still waiting, under 24h    -> pending (not due yet, left out of the rate)
// A decision made BEFORE the latest hand-in belongs to an earlier round (the item was sent back and
// handed in again), so it does not count as a decision on this one.
const judge = (rows: HandIn[], now: number): ApprovalTatCounts => {
    const counts = EMPTY()
    for (const row of rows) {
        const submitted = row.submittedAt.getTime()
        const decided = row.verifiedAt && row.verifiedAt.getTime() >= submitted ? row.verifiedAt.getTime() : null
        if (decided !== null) {
            if (decided - submitted <= WINDOW_MS) counts.met += 1
            else counts.breached += 1
        } else if (now - submitted > WINDOW_MS) {
            counts.breached += 1
        } else {
            counts.pending += 1
        }
    }
    return counts
}

const sum = (...parts: ApprovalTatCounts[]): ApprovalTatCounts =>
    parts.reduce((acc, p) => ({ met: acc.met + p.met, breached: acc.breached + p.breached, pending: acc.pending + p.pending }), EMPTY())

export const approvalTatService = {
    /** Hand-ins whose submit time falls in [from, to): delegations, tickets and checklist runs together. */
    async summary(from: Date, to: Date, now = Date.now()): Promise<ApprovalTatResult> {
        const taskRows = await db
            .select({ submittedAt: tasks.submittedAt, verifiedAt: tasks.verifiedAt })
            .from(tasks)
            .where(and(isNull(tasks.deletedAt), isNotNull(tasks.submittedAt), gte(tasks.submittedAt, from), lt(tasks.submittedAt, to)))

        // Tickets have no submit column: the hand-in is the "pending approval" step in their status
        // history. A ticket handed in more than once keeps only its latest hand-in.
        const ticketRows = await db
            .select({ ticketId: ticketStatusUpdates.ticketId, submittedAt: ticketStatusUpdates.createdAt, verifiedAt: tickets.verifiedAt })
            .from(ticketStatusUpdates)
            .innerJoin(tickets, eq(tickets.id, ticketStatusUpdates.ticketId))
            .where(and(
                isNull(tickets.deletedAt),
                eq(ticketStatusUpdates.toStatus, "PENDING_APPROVAL"),
                gte(ticketStatusUpdates.createdAt, from),
                lt(ticketStatusUpdates.createdAt, to),
            ))
        const latestPerTicket = new Map<string, HandIn>()
        for (const row of ticketRows) {
            const known = latestPerTicket.get(row.ticketId)
            if (!known || row.submittedAt.getTime() > known.submittedAt.getTime()) {
                latestPerTicket.set(row.ticketId, { submittedAt: row.submittedAt, verifiedAt: row.verifiedAt })
            }
        }

        const checklistRows = await db
            .select({ submittedAt: checklistInstances.submittedAt, verifiedAt: checklistInstances.verifiedAt })
            .from(checklistInstances)
            .where(and(isNotNull(checklistInstances.submittedAt), gte(checklistInstances.submittedAt, from), lt(checklistInstances.submittedAt, to)))

        const asHandIns = (rows: { submittedAt: Date | null; verifiedAt: Date | null }[]): HandIn[] =>
            rows.filter((r): r is { submittedAt: Date; verifiedAt: Date | null } => r.submittedAt !== null)

        const delegation = judge(asHandIns(taskRows), now)
        const ticket = judge([...latestPerTicket.values()], now)
        const checklist = judge(asHandIns(checklistRows), now)
        const total = sum(delegation, ticket, checklist)
        const due = total.met + total.breached

        return {
            ...total,
            windowHours: APPROVAL_TAT_HOURS,
            rate: due > 0 ? Math.round((total.met / due) * 100) : null,
            byKind: { delegation, ticket, checklist },
        }
    },
}
