import { and, eq, gte, inArray, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { departments, stores, users } from "../../db/schema/core.js"
import { taskAdditionalAssignees, tasks } from "../../db/schema/task.js"
import { tickets } from "../../db/schema/ticket.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { checklistReportService, type PersonRow, type ReportMetrics } from "../checklistReports/checklistReport.service.js"

// Same weights as TASK_SCORE on the client: started is a quarter, handed in for approval three
// quarters, only done is the full mark.
const TASK_WEIGHT: Record<string, number> = { draft: 0, todo: 0, in_progress: 0.25, pending_approval: 0.75, done: 1 }
const DAY_MS = 86_400_000

export type ScoreScope = "person" | "department" | "store"

export type ChecklistScore = {
    score: number | null
    completionPct: number | null
    compliancePct: number | null
    /** Runs that have come due: finished, or past their deadline. Runs still ahead are left out. */
    due: number
    completed: number
    missed: number
    submitted: number
    approved: number
}
// Completion is the share of due items that got done. Compliance is the share that got done on time.
export type TicketScore = { score: number | null; completionPct: number | null; compliancePct: number | null; due: number; closed: number; onTime: number; late: number }
export type DelegationScore = { score: number | null; completionPct: number | null; compliancePct: number | null; due: number; done: number; onTime: number; overdue: number }

export type Scores = {
    scope: ScoreScope
    id: string
    name: string
    from: string
    to: string
    checklist: ChecklistScore
    ticket: TicketScore
    delegation: DelegationScore
}

export type ScoreReportRow = { id: string; name: string; department: string; role?: string; checklist: ChecklistScore; ticket: TicketScore; delegation: DelegationScore }
export type ScoreReport = { from: string; to: string; generatedAt: string; departments: ScoreReportRow[]; people: ScoreReportRow[]; notes: string[] }

export const SCORE_REPORT_NOTES = [
    "Checklist: only runs that have come due count (finished, or past their deadline), so a running period does not dip for runs still ahead. The score is compliance when answers have been checked, otherwise completion.",
    "Tickets: a ticket counts when its due time falls in the window. Completion is the share closed, compliance the share closed on or before the due time.",
    "Delegations: counted when due in the window or already done. Completion is the share done, compliance the share done on or before the due date (handed-in time, else approval time, else last update). Score is weighted by status (to do 0, in progress 25, waiting approval 75, done 100). Drafts never count.",
    "A person is scored on what is assigned to them. A department is scored on what belongs to the department, so its figures can differ from the sum of its people.",
]

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null)
const sum = <T,>(rows: readonly T[], pick: (r: T) => number) => rows.reduce((total, r) => total + pick(r), 0)

// Checklist block for one person or a group: a group is the sum of its people. Compliance is averaged
// by how many answers were checked, so two checked answers do not weigh as much as two hundred.
const foldChecklist = (rows: readonly (ReportMetrics & { answersChecked: number })[]): ChecklistScore => {
    const completed = sum(rows, (r) => r.completed)
    const missed = sum(rows, (r) => r.missed)
    const due = completed + missed
    const checked = sum(rows, (r) => (r.compliancePct === null ? 0 : r.answersChecked))
    const compliancePct = checked > 0 ? Math.round(sum(rows, (r) => (r.compliancePct === null ? 0 : r.compliancePct * r.answersChecked)) / checked) : null
    const completionPct = pct(completed, due)
    return {
        score: compliancePct ?? completionPct,
        completionPct,
        compliancePct,
        due,
        completed,
        missed,
        submitted: sum(rows, (r) => r.submitted),
        approved: sum(rows, (r) => r.approved),
    }
}

type TaskLike = { status: string; dueDate: Date | null; finishedAt: Date | null }
type TicketLike = { status: string; tatDueAt: Date | null; closedAt: Date | null }

// Delegations: only what has come due (or is already done). Drafts are private and never count.
const foldTasks = (rows: readonly TaskLike[], now: Date): DelegationScore => {
    const due = rows.filter((t) => t.status !== "draft" && (t.status === "done" || (t.dueDate !== null && t.dueDate < now)))
    const weighted = sum(due, (t) => TASK_WEIGHT[t.status] ?? 0)
    const done = due.filter((t) => t.status === "done")
    // Done with no due date or no finish time on record cannot be late.
    const onTime = done.filter((t) => !t.dueDate || !t.finishedAt || t.finishedAt <= t.dueDate).length
    return {
        score: due.length ? Math.round((weighted / due.length) * 100) : null,
        completionPct: pct(done.length, due.length),
        compliancePct: pct(onTime, due.length),
        due: due.length,
        done: done.length,
        onTime,
        overdue: due.filter((t) => t.status !== "done" && t.dueDate !== null && t.dueDate < now).length,
    }
}

// Tickets: completion is the share of due tickets closed, compliance the share closed on or before their due time.
const foldTickets = (rows: readonly TicketLike[], now: Date): TicketScore => {
    const due = rows.filter((t) => t.status === "CLOSED" || (t.tatDueAt !== null && t.tatDueAt < now))
    const closed = due.filter((t) => t.status === "CLOSED")
    const onTime = closed.filter((t) => t.closedAt && t.tatDueAt && t.closedAt <= t.tatDueAt).length
    return { score: pct(onTime, due.length), completionPct: pct(closed.length, due.length), compliancePct: pct(onTime, due.length), due: due.length, closed: closed.length, onTime, late: due.length - onTime }
}

// When a task was finished: handed in, else approved, else last touched.
const finishedAt = (t: { submittedAt: Date | null; verifiedAt: Date | null; updatedAt: Date }) => t.submittedAt ?? t.verifiedAt ?? t.updatedAt

const windowOf = (from: string, to: string) => {
    const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
    return { start: new Date(Date.parse(`${from}T00:00:00.000Z`) - offsetMs), end: new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS - offsetMs) }
}

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
        const { start, end } = windowOf(from, to)
        const now = new Date()

        // The checklist report is the heaviest query. If it fails the delegation and ticket scores still
        // show, and the checklist tile simply reads as no data, instead of the whole card erroring.
        const [people, taskRows, ticketRows] = await Promise.all([
            target.checklistFor(viewer, from, to).catch((err: unknown) => {
                console.error("scores: checklist part failed", err)
                return null
            }),
            db
                .select({ status: tasks.status, dueDate: tasks.dueDate, submittedAt: tasks.submittedAt, verifiedAt: tasks.verifiedAt, updatedAt: tasks.updatedAt })
                .from(tasks)
                .where(and(isNull(tasks.deletedAt), gte(tasks.dueDate, start), lt(tasks.dueDate, end), target.taskWhere)),
            db
                .select({ status: tickets.status, tatDueAt: tickets.tatDueAt, closedAt: tickets.closedAt })
                .from(tickets)
                .where(and(isNull(tickets.deletedAt), gte(tickets.tatDueAt, start), lt(tickets.tatDueAt, end), target.ticketWhere)),
        ])

        return { scope, id, name: target.name, from, to, checklist: foldChecklist(people ?? []), ticket: foldTickets(ticketRows, now), delegation: foldTasks(taskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) })), now) }
    },

    /**
     * Every department and every person the viewer may see, scored for one window: the table behind the
     * export. ADMIN/PC see the whole organisation, MANAGER/SENIOR their own department, nobody else.
     */
    async report(viewer: AccessTokenPayload, from: string, to: string): Promise<ScoreReport> {
        const orgWide = viewer.role === "ADMIN" || viewer.role === "PC"
        const hod = viewer.role === "MANAGER" || viewer.role === "SENIOR"
        if (!orgWide && !hod) throw AppError.forbidden()
        // A head with no department on the record sees nothing, never everyone.
        const onlyDepartment = orgWide ? undefined : viewer.departmentId ?? "no-department"
        const { start, end } = windowOf(from, to)
        const now = new Date()

        const [checklist, peopleRows, deptRows, taskRows, ticketRows] = await Promise.all([
            checklistReportService.build(viewer, { from, to, groupBy: "both" }).catch((err: unknown) => {
                console.error("scores: checklist report failed", err)
                return null
            }),
            db
                .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, departmentId: users.departmentId })
                .from(users)
                .where(and(eq(users.isActive, true), onlyDepartment ? eq(users.departmentId, onlyDepartment) : undefined)),
            db.select({ id: departments.id, name: departments.name }).from(departments).where(onlyDepartment ? eq(departments.id, onlyDepartment) : undefined),
            db
                .select({ status: tasks.status, dueDate: tasks.dueDate, assigneeId: tasks.assigneeId, departmentId: tasks.departmentId, submittedAt: tasks.submittedAt, verifiedAt: tasks.verifiedAt, updatedAt: tasks.updatedAt })
                .from(tasks)
                .where(and(isNull(tasks.deletedAt), gte(tasks.dueDate, start), lt(tasks.dueDate, end), isNotNull(tasks.assigneeId), onlyDepartment ? eq(tasks.departmentId, onlyDepartment) : undefined)),
            db
                .select({ status: tickets.status, tatDueAt: tickets.tatDueAt, closedAt: tickets.closedAt, assigneeId: tickets.assigneeId, departmentId: tickets.departmentId })
                .from(tickets)
                .where(and(isNull(tickets.deletedAt), gte(tickets.tatDueAt, start), lt(tickets.tatDueAt, end), isNotNull(tickets.assigneeId), onlyDepartment ? eq(tickets.departmentId, onlyDepartment) : undefined)),
        ])

        const deptName = new Map(deptRows.map((d) => [d.id, d.name]))
        const nameOfDept = (id: string | null) => (id ? deptName.get(id) ?? "Unknown" : "No department")
        const checklistByPerson = new Map((checklist?.people ?? []).map((p) => [p.userId, p]))
        const checklistByDept = new Map((checklist?.departments ?? []).map((d) => [d.departmentId, d]))
        const group = <T extends { assigneeId: string | null; departmentId: string | null }>(rows: T[], key: "assigneeId" | "departmentId") => {
            const map = new Map<string, T[]>()
            for (const r of rows) {
                const k = r[key]
                if (!k) continue
                map.set(k, [...(map.get(k) ?? []), r])
            }
            return map
        }
        const reportTasks = taskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) }))
        const tasksByPerson = group(reportTasks, "assigneeId")
        const ticketsByPerson = group(ticketRows, "assigneeId")
        const tasksByDept = group(reportTasks, "departmentId")
        const ticketsByDept = group(ticketRows, "departmentId")

        const rowFor = (id: string, name: string, department: string, role: string | undefined, c: ChecklistScore, tk: TicketLike[], ts: TaskLike[]): ScoreReportRow => ({
            id, name, department, role, checklist: c, ticket: foldTickets(tk, now), delegation: foldTasks(ts, now),
        })
        const hasData = (r: ScoreReportRow) => r.checklist.due > 0 || r.ticket.due > 0 || r.delegation.due > 0

        const people = peopleRows
            .map((p) => {
                const c = checklistByPerson.get(p.id)
                return rowFor(p.id, `${p.firstName} ${p.lastName ?? ""}`.trim(), nameOfDept(p.departmentId), p.role, foldChecklist(c ? [c] : []), ticketsByPerson.get(p.id) ?? [], tasksByPerson.get(p.id) ?? [])
            })
            .filter(hasData)
            .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name))

        const depts = deptRows
            .map((d) => {
                const c = checklistByDept.get(d.id)
                return rowFor(d.id, d.name, d.name, undefined, foldChecklist(c ? [c] : []), ticketsByDept.get(d.id) ?? [], tasksByDept.get(d.id) ?? [])
            })
            .filter(hasData)
            .sort((a, b) => a.name.localeCompare(b.name))

        return { from, to, generatedAt: new Date().toISOString(), departments: depts, people, notes: SCORE_REPORT_NOTES }
    },
}
