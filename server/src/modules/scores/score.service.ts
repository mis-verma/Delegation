import { and, eq, gte, inArray, isNull, lt, or, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { departments, stores, users } from "../../db/schema/core.js"
import { taskAdditionalAssignees, tasks } from "../../db/schema/task.js"
import { tickets } from "../../db/schema/ticket.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { checklistReportService, type PersonRow } from "../checklistReports/checklistReport.service.js"

// Same weights as TASK_SCORE on the client: started is a quarter, handed in for approval three
// quarters, only done is the full mark.
const TASK_WEIGHT: Record<string, number> = { draft: 0, todo: 0, in_progress: 0.25, pending_approval: 0.75, done: 1 }
const DAY_MS = 86_400_000

export type ScoreScope = "person" | "department" | "store"

export type Scores = {
    scope: ScoreScope
    id: string
    name: string
    from: string
    to: string
    checklist: { score: number | null; completionPct: number | null; compliancePct: number | null; assigned: number; completed: number; missed: number; submitted: number; approved: number }
    ticket: { score: number | null; due: number; onTime: number; late: number }
    delegation: { score: number | null; due: number; done: number; overdue: number }
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null)
const sum = (rows: PersonRow[], pick: (r: PersonRow) => number) => rows.reduce((total, r) => total + pick(r), 0)

type Target = { name: string; taskWhere: SQL | undefined; ticketWhere: SQL | undefined; checklistFor: (viewer: AccessTokenPayload, from: string, to: string) => Promise<PersonRow[]> }

const peopleOf = (viewer: AccessTokenPayload, from: string, to: string, filters: { departmentId?: string; storeId?: string }, onlyUserId?: string) =>
    checklistReportService.build(viewer, { from, to, groupBy: "person", ...filters }, onlyUserId).then((r) => r.people)

export const scoreService = {
    /**
     * Who may open what. A person: yourself, anyone for ADMIN/PC, your own department for MANAGER/SENIOR.
     * A department: ADMIN/PC any, MANAGER/SENIOR only their own. A store: ADMIN/PC only. Fails closed.
     */
    async resolve(viewer: AccessTokenPayload, scope: ScoreScope, id: string): Promise<Target> {
        const orgWide = viewer.role === "ADMIN" || viewer.role === "PC"
        const hod = viewer.role === "MANAGER" || viewer.role === "SENIOR"

        if (scope === "person") {
            const [target] = await db
                .select({ firstName: users.firstName, lastName: users.lastName, departmentId: users.departmentId })
                .from(users)
                .where(eq(users.id, id))
                .limit(1)
            if (!target) throw AppError.notFound("Person not found")
            const allowed = viewer.sub === id || orgWide || (hod && !!viewer.departmentId && viewer.departmentId === target.departmentId)
            if (!allowed) throw AppError.forbidden()
            return {
                name: `${target.firstName} ${target.lastName ?? ""}`.trim(),
                taskWhere: or(eq(tasks.assigneeId, id), inArray(tasks.id, db.select({ taskId: taskAdditionalAssignees.taskId }).from(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.userId, id)))),
                ticketWhere: eq(tickets.assigneeId, id),
                checklistFor: (v, from, to) => peopleOf(v, from, to, {}, id),
            }
        }

        if (scope === "department") {
            if (!orgWide && !(hod && !!viewer.departmentId && viewer.departmentId === id)) throw AppError.forbidden()
            const [dept] = await db.select({ name: departments.name }).from(departments).where(eq(departments.id, id)).limit(1)
            if (!dept) throw AppError.notFound("Department not found")
            return {
                name: dept.name,
                taskWhere: eq(tasks.departmentId, id),
                ticketWhere: eq(tickets.departmentId, id),
                checklistFor: (v, from, to) => peopleOf(v, from, to, { departmentId: id }),
            }
        }

        if (!orgWide) throw AppError.forbidden()
        const [store] = await db.select({ name: stores.name }).from(stores).where(eq(stores.id, id)).limit(1)
        if (!store) throw AppError.notFound("Store not found")
        return {
            name: store.name,
            // Delegations have no store of their own, so they follow the store of whoever they are assigned to.
            taskWhere: inArray(tasks.assigneeId, db.select({ id: users.id }).from(users).where(eq(users.storeId, id))),
            ticketWhere: eq(tickets.storeId, id),
            checklistFor: (v, from, to) => peopleOf(v, from, to, { storeId: id }),
        }
    },

    /** `from` and `to` are org-local days (YYYY-MM-DD), both included. */
    async forScope(viewer: AccessTokenPayload, scope: ScoreScope, id: string, from: string, to: string): Promise<Scores> {
        const target = await this.resolve(viewer, scope, id)
        const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
        const start = new Date(Date.parse(`${from}T00:00:00.000Z`) - offsetMs)
        const end = new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS - offsetMs)
        const now = new Date()

        // The checklist report is the heaviest query. If it fails the delegation and ticket scores still
        // show, and the checklist tile simply reads as no data, instead of the whole card erroring.
        const [people, taskRows, ticketRows] = await Promise.all([
            target.checklistFor(viewer, from, to).catch((err: unknown) => {
                console.error("scores: checklist part failed", err)
                return null
            }),
            db
                .select({ status: tasks.status, dueDate: tasks.dueDate })
                .from(tasks)
                .where(and(isNull(tasks.deletedAt), gte(tasks.dueDate, start), lt(tasks.dueDate, end), target.taskWhere)),
            db
                .select({ status: tickets.status, tatDueAt: tickets.tatDueAt, closedAt: tickets.closedAt })
                .from(tickets)
                .where(and(isNull(tickets.deletedAt), gte(tickets.tatDueAt, start), lt(tickets.tatDueAt, end), target.ticketWhere)),
        ])

        // Checklist: a group is the sum of its people. Compliance is averaged by how many answers were
        // checked, so a person with two checked answers does not weigh as much as one with two hundred.
        const rows = people ?? []
        const assigned = sum(rows, (r) => r.assigned)
        const completed = sum(rows, (r) => r.completed)
        const checked = sum(rows, (r) => (r.compliancePct === null ? 0 : r.answersChecked))
        const compliancePct = checked > 0 ? Math.round(sum(rows, (r) => (r.compliancePct === null ? 0 : r.compliancePct * r.answersChecked)) / checked) : null
        const completionPct = pct(completed, assigned)

        // Delegations: only what has come due (or is already done), so the running period does not dip
        // for work that is simply not due yet. Drafts are private and never count.
        const dueTasks = taskRows.filter((t) => t.status !== "draft" && (t.status === "done" || (t.dueDate !== null && t.dueDate < now)))
        const weighted = dueTasks.reduce((total, t) => total + (TASK_WEIGHT[t.status] ?? 0), 0)

        // Tickets: share of due tickets closed on or before their due time.
        const dueTickets = ticketRows.filter((t) => t.status === "CLOSED" || (t.tatDueAt !== null && t.tatDueAt < now))
        const onTime = dueTickets.filter((t) => t.status === "CLOSED" && t.closedAt && t.tatDueAt && t.closedAt <= t.tatDueAt).length

        return {
            scope,
            id,
            name: target.name,
            from,
            to,
            checklist: {
                // Compliance when answers have been checked, else plain completion.
                score: compliancePct ?? completionPct,
                completionPct,
                compliancePct,
                assigned,
                completed,
                missed: sum(rows, (r) => r.missed),
                submitted: sum(rows, (r) => r.submitted),
                approved: sum(rows, (r) => r.approved),
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
