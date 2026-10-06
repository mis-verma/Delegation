import { and, eq, gte, inArray, isNull, lt, or } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { users } from "../../db/schema/core.js"
import { taskAdditionalAssignees, tasks } from "../../db/schema/task.js"
import { tickets } from "../../db/schema/ticket.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { checklistReportService } from "../checklistReports/checklistReport.service.js"

// Same weights as TASK_SCORE on the client: started is a quarter, handed in for approval three
// quarters, only done is the full mark.
const TASK_WEIGHT: Record<string, number> = { draft: 0, todo: 0, in_progress: 0.25, pending_approval: 0.75, done: 1 }
const DAY_MS = 86_400_000

export type PersonScores = {
    userId: string
    name: string
    from: string
    to: string
    checklist: { score: number | null; completionPct: number | null; compliancePct: number | null; assigned: number; completed: number; missed: number; submitted: number; approved: number }
    ticket: { score: number | null; due: number; onTime: number; late: number }
    delegation: { score: number | null; due: number; done: number; overdue: number }
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null)

export const scoreService = {
    /** Self for everyone, anyone for ADMIN/PC, own department for MANAGER/SENIOR. Fails closed. */
    async assertCanView(viewer: AccessTokenPayload, targetId: string) {
        const [target] = await db
            .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, departmentId: users.departmentId })
            .from(users)
            .where(eq(users.id, targetId))
            .limit(1)
        if (!target) throw AppError.notFound("Person not found")
        if (viewer.sub === targetId || viewer.role === "ADMIN" || viewer.role === "PC") return target
        if ((viewer.role === "MANAGER" || viewer.role === "SENIOR") && viewer.departmentId && viewer.departmentId === target.departmentId) return target
        throw AppError.forbidden()
    },

    /** `from` and `to` are org-local days (YYYY-MM-DD), both included. */
    async forPerson(viewer: AccessTokenPayload, targetId: string, from: string, to: string): Promise<PersonScores> {
        const target = await this.assertCanView(viewer, targetId)
        const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
        const start = new Date(Date.parse(`${from}T00:00:00.000Z`) - offsetMs)
        const end = new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS - offsetMs)
        const now = new Date()

        // The checklist report is the heaviest query. If it fails the delegation and ticket scores still
        // show, and the checklist tile simply reads as no data, instead of the whole card erroring.
        const [checklistResult, taskRows, ticketRows] = await Promise.all([
            checklistReportService.build(viewer, { from, to, groupBy: "person" }, targetId).catch((err: unknown) => {
                console.error("scores: checklist part failed", err)
                return null
            }),
            db
                .select({ status: tasks.status, dueDate: tasks.dueDate })
                .from(tasks)
                .where(and(
                    isNull(tasks.deletedAt),
                    gte(tasks.dueDate, start),
                    lt(tasks.dueDate, end),
                    or(
                        eq(tasks.assigneeId, targetId),
                        inArray(tasks.id, db.select({ id: taskAdditionalAssignees.taskId }).from(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.userId, targetId))),
                    ),
                )),
            db
                .select({ status: tickets.status, tatDueAt: tickets.tatDueAt, closedAt: tickets.closedAt })
                .from(tickets)
                .where(and(isNull(tickets.deletedAt), eq(tickets.assigneeId, targetId), gte(tickets.tatDueAt, start), lt(tickets.tatDueAt, end))),
        ])

        const me = checklistResult?.people[0]

        // Delegations: only what has come due (or is already done), so the running period does not dip
        // for work that is simply not due yet. Drafts are private and never count.
        const dueTasks = taskRows.filter((t) => t.status !== "draft" && (t.status === "done" || (t.dueDate !== null && t.dueDate < now)))
        const weighted = dueTasks.reduce((sum, t) => sum + (TASK_WEIGHT[t.status] ?? 0), 0)

        // Tickets: share of due tickets closed on or before their due time.
        const dueTickets = ticketRows.filter((t) => t.status === "CLOSED" || (t.tatDueAt !== null && t.tatDueAt < now))
        const onTime = dueTickets.filter((t) => t.status === "CLOSED" && t.closedAt && t.tatDueAt && t.closedAt <= t.tatDueAt).length

        return {
            userId: targetId,
            name: `${target.firstName} ${target.lastName ?? ""}`.trim(),
            from,
            to,
            checklist: {
                // Compliance when the person has had answers checked, else plain completion.
                score: me ? me.compliancePct ?? me.completionPct : null,
                completionPct: me?.completionPct ?? null,
                compliancePct: me?.compliancePct ?? null,
                assigned: me?.assigned ?? 0,
                completed: me?.completed ?? 0,
                missed: me?.missed ?? 0,
                submitted: me?.submitted ?? 0,
                approved: me?.approved ?? 0,
            },
            ticket: { score: pct(onTime, dueTickets.length), due: dueTickets.length, onTime, late: dueTickets.length - onTime },
            delegation: {
                score: dueTasks.length ? Math.round((weighted / dueTasks.length) * 100) : null,
                due: dueTasks.length,
                done: dueTasks.filter((t) => t.status === "done").length,
                overdue: dueTasks.filter((t) => t.status !== "done" && t.dueDate !== null && t.dueDate < now).length,
            },
        }
    },
}

