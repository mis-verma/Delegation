import { db } from "../../config/db.js"
import { tasks } from "../../db/schema/task.js"
import { tickets, ticketStatusUpdates } from "../../db/schema/ticket.js"
import { checklistInstances } from "../../db/schema/checklistInstance.js"
import { checklistDefinitions } from "../../db/schema/checklistDefinition.js"
import { checklistInstanceAssignees } from "../../db/schema/checklistInstance.js"
import { users } from "../../db/schema/core.js"
import { and, eq, gte, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm"

export const APPROVAL_TAT_HOURS = 24
const WINDOW_MS = APPROVAL_TAT_HOURS * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

export type ApprovalTatCounts = { met: number; breached: number; pending: number }

export type ApprovalWaiting = { now: number; over24h: number }

export type ApprovalTatResult = ApprovalTatCounts & {
    windowHours: number
    rate: number | null
    byKind: { delegation: ApprovalTatCounts; ticket: ApprovalTatCounts; checklist: ApprovalTatCounts }
    decided: number
    avgDecisionHours: number | null
    avgDecisionHoursByKind: { delegation: number | null; ticket: number | null; checklist: number | null }
    waiting: { delegation: ApprovalWaiting; ticket: ApprovalWaiting; checklist: ApprovalWaiting; total: ApprovalWaiting }
}

type HandIn = { submittedAt: Date; verifiedAt: Date | null }

const EMPTY = (): ApprovalTatCounts => ({ met: 0, breached: 0, pending: 0 })

const decidedAt = (row: HandIn): number | null =>
    row.verifiedAt && row.verifiedAt.getTime() >= row.submittedAt.getTime() ? row.verifiedAt.getTime() : null

const judge = (rows: HandIn[], now: number): ApprovalTatCounts => {
    const counts = EMPTY()
    for (const row of rows) {
        const submitted = row.submittedAt.getTime()
        const decided = decidedAt(row)
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

const decisionTime = (rows: HandIn[]): { hours: number; count: number } => {
    let hours = 0
    let count = 0
    for (const row of rows) {
        const decided = decidedAt(row)
        if (decided === null) continue
        hours += (decided - row.submittedAt.getTime()) / HOUR_MS
        count += 1
    }
    return { hours, count }
}

const avg = (part: { hours: number; count: number }) => (part.count > 0 ? Math.round((part.hours / part.count) * 10) / 10 : null)

const sum = (...parts: ApprovalTatCounts[]): ApprovalTatCounts =>
    parts.reduce((acc, p) => ({ met: acc.met + p.met, breached: acc.breached + p.breached, pending: acc.pending + p.pending }), EMPTY())

const waitingOf = (rows: { submittedAt: Date | null; updatedAt: Date }[], now: number): ApprovalWaiting => ({
    now: rows.length,
    over24h: rows.filter((r) => now - (r.submittedAt ?? r.updatedAt).getTime() > WINDOW_MS).length,
})

export const approvalTatService = {
    async summary(from: Date, to: Date, now = Date.now(), departmentId?: string): Promise<ApprovalTatResult> {
        const taskDept: SQL | undefined = departmentId ? eq(tasks.departmentId, departmentId) : undefined
        const ticketDept: SQL | undefined = departmentId ? eq(tickets.departmentId, departmentId) : undefined
        const runDept: SQL | undefined = departmentId
            ? sql`EXISTS (SELECT 1 FROM ${checklistInstanceAssignees} a JOIN ${users} u ON u.id = a.userId WHERE a.instanceId = ${checklistInstances.id} AND u.departmentId = ${departmentId})`
            : undefined
        const [taskRows, ticketRows, checklistRows, waitingTasks, waitingTickets, waitingChecklists] = await Promise.all([
            db
                .select({ submittedAt: tasks.submittedAt, verifiedAt: tasks.verifiedAt })
                .from(tasks)
                .where(and(isNull(tasks.deletedAt), isNotNull(tasks.submittedAt), gte(tasks.submittedAt, from), lt(tasks.submittedAt, to), taskDept)),
            db
                .select({ ticketId: ticketStatusUpdates.ticketId, submittedAt: ticketStatusUpdates.createdAt, verifiedAt: tickets.verifiedAt })
                .from(ticketStatusUpdates)
                .innerJoin(tickets, eq(tickets.id, ticketStatusUpdates.ticketId))
                .where(and(
                    isNull(tickets.deletedAt),
                    eq(ticketStatusUpdates.toStatus, "PENDING_APPROVAL"),
                    gte(ticketStatusUpdates.createdAt, from),
                    lt(ticketStatusUpdates.createdAt, to),
                    ticketDept,
                )),
            db
                .select({ submittedAt: checklistInstances.submittedAt, verifiedAt: checklistInstances.verifiedAt })
                .from(checklistInstances)
                .where(and(isNotNull(checklistInstances.submittedAt), gte(checklistInstances.submittedAt, from), lt(checklistInstances.submittedAt, to), runDept)),
            db
                .select({ submittedAt: tasks.submittedAt, updatedAt: tasks.updatedAt })
                .from(tasks)
                .where(and(isNull(tasks.deletedAt), eq(tasks.status, "pending_approval"), taskDept)),
            db
                .select({ submittedAt: tickets.submittedAt, updatedAt: tickets.updatedAt })
                .from(tickets)
                .where(and(isNull(tickets.deletedAt), eq(tickets.status, "PENDING_APPROVAL"), ticketDept)),
            db
                .select({ submittedAt: checklistInstances.submittedAt, updatedAt: checklistInstances.updatedAt })
                .from(checklistInstances)
                .where(and(
                    eq(checklistInstances.verificationStatus, "PENDING_APPROVAL"),
                    sql`NOT EXISTS (SELECT 1 FROM ${checklistDefinitions} d WHERE d.id = ${checklistInstances.definitionId} AND d.deletedAt IS NOT NULL)`,
                    runDept,
                )),
        ])

        const latestPerTicket = new Map<string, HandIn>()
        for (const row of ticketRows) {
            const known = latestPerTicket.get(row.ticketId)
            if (!known || row.submittedAt.getTime() > known.submittedAt.getTime()) {
                latestPerTicket.set(row.ticketId, { submittedAt: row.submittedAt, verifiedAt: row.verifiedAt })
            }
        }

        const asHandIns = (rows: { submittedAt: Date | null; verifiedAt: Date | null }[]): HandIn[] =>
            rows.filter((r): r is { submittedAt: Date; verifiedAt: Date | null } => r.submittedAt !== null)

        const delegationHandIns = asHandIns(taskRows)
        const ticketHandIns = [...latestPerTicket.values()]
        const checklistHandIns = asHandIns(checklistRows)

        const delegation = judge(delegationHandIns, now)
        const ticket = judge(ticketHandIns, now)
        const checklist = judge(checklistHandIns, now)
        const total = sum(delegation, ticket, checklist)
        const due = total.met + total.breached

        const times = { delegation: decisionTime(delegationHandIns), ticket: decisionTime(ticketHandIns), checklist: decisionTime(checklistHandIns) }
        const allTimes = {
            hours: times.delegation.hours + times.ticket.hours + times.checklist.hours,
            count: times.delegation.count + times.ticket.count + times.checklist.count,
        }

        const waiting = {
            delegation: waitingOf(waitingTasks, now),
            ticket: waitingOf(waitingTickets, now),
            checklist: waitingOf(waitingChecklists, now),
        }

        return {
            ...total,
            windowHours: APPROVAL_TAT_HOURS,
            rate: due > 0 ? Math.round((total.met / due) * 100) : null,
            byKind: { delegation, ticket, checklist },
            decided: allTimes.count,
            avgDecisionHours: avg(allTimes),
            avgDecisionHoursByKind: { delegation: avg(times.delegation), ticket: avg(times.ticket), checklist: avg(times.checklist) },
            waiting: {
                ...waiting,
                total: {
                    now: waiting.delegation.now + waiting.ticket.now + waiting.checklist.now,
                    over24h: waiting.delegation.over24h + waiting.ticket.over24h + waiting.checklist.over24h,
                },
            },
        }
    },
}
