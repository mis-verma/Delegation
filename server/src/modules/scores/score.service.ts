import { and, eq, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { departments, stores, users } from "../../db/schema/core.js"
import { taskAdditionalAssignees, tasks } from "../../db/schema/task.js"
import { tickets } from "../../db/schema/ticket.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { checklistReportService, type ReportMetrics } from "../checklistReports/checklistReport.service.js"
import { isRankable, lateOf, metDeadlinePct, notDone, onTimeOfFinishedPct, overallOf, pct, rawPct, round1 } from "./scoreFormulas.js"

// Same weights as TASK_SCORE on the client: started is a quarter, handed in for approval three
// quarters, only done is the full mark.
const TASK_WEIGHT: Record<string, number> = { draft: 0, todo: 0, in_progress: 0.25, pending_approval: 0.75, done: 1, on_hold: 0 }
const OVERDUE_EXEMPT_STATUSES = new Set(["done", "draft", "pending_approval"])
const DAY_MS = 86_400_000

export type ScoreScope = "person" | "department" | "store" | "org"

// All percentages in this file are 0-100 with one decimal at most (null = nothing to measure). Counts are
// exact. Every module block carries the same count words: due, done, onTime, late, notDone.
export type ChecklistScore = {
    /** Compliance when answers have been checked, otherwise completion. */
    score: number | null
    /** Run based: completed / due. Runs still open before their deadline are in neither side. */
    completionPct: number | null
    /** Pooled weighted compliance: weightedGood / weightedScored. */
    compliancePct: number | null
    /** Same figure as onTimeOfFinishedPct, kept for older callers. */
    onTimePct: number | null
    /** Of the runs that were finished, the share finished on time: onTime / completed. */
    onTimeOfFinishedPct: number | null
    /** onTime / due: late and missed runs both count against it. */
    metDeadlinePct: number | null
    onTime: number
    /** Runs that have come due: completed, or past their deadline. Runs still ahead are left out. */
    due: number
    completed: number
    /** Same as completed, named like the other modules. */
    done: number
    missed: number
    /** Same as missed (due - done), named like the other modules. */
    notDone: number
    /** Finished, but after the cutoff: completed - onTime. */
    late: number
    /** Not completed and still before the deadline: in no percentage. */
    open: number
    submitted: number
    approved: number
    /** Raw weights behind compliancePct, to pool rows without averaging percentages. */
    answersChecked: number
    weightedGood: number
    weightedScored: number
}
// Completion is the share of due items done. Compliance is the share done on time (for checklists, how well
// the checked answers were answered). On time is, of the items that were FINISHED, the share finished on time.
/**
 * `late` = closed after the due time. Open tickets are not late here; they are due - closed ("not done").
 * `waitingOnTime` = handed in on or before the due time and still waiting for approval: not done yet, but
 * on time, so it counts toward compliance (the worker's clock stopped at hand-in).
 * `done` = `closed`; `notDone` = due - done, so a ticket waiting for approval is still not done until approved.
 */
export type TicketScore = {
    score: number | null
    completionPct: number | null
    compliancePct: number | null
    /** onTime / closed. */
    onTimePct: number | null
    onTimeOfFinishedPct: number | null
    /** (onTime + waitingOnTime) / due; the same figure as compliancePct. */
    metDeadlinePct: number | null
    due: number
    closed: number
    done: number
    notDone: number
    onTime: number
    late: number
    waitingOnTime: number
}
export type DelegationScore = {
    score: number | null
    completionPct: number | null
    compliancePct: number | null
    /** onTime / done. */
    onTimePct: number | null
    onTimeOfFinishedPct: number | null
    /** (onTime + waitingOnTime) / due; the same figure as compliancePct. */
    metDeadlinePct: number | null
    due: number
    done: number
    /** due - done: waiting-for-approval items stay here until approved. */
    notDone: number
    onTime: number
    /** Done, but after the due date: done - onTime. */
    late: number
    /** Past due and not done, not counting drafts or items waiting for approval. */
    overdue: number
    waitingOnTime: number
}

type ModuleBlocks = { checklist: ChecklistScore; ticket: TicketScore; delegation: DelegationScore }

export type Scores = ModuleBlocks & {
    scope: ScoreScope
    id: string
    name: string
    from: string
    to: string
    /** Completion and compliance of every module with something due, averaged unrounded (overallOf). */
    overall: number | null
    /** checklist.due + ticket.due + delegation.due. */
    totalDue: number
    /** totalDue is at least MIN_RANK_VOLUME, so the row may be ranked. */
    rankable: boolean
}

export type TrendPeriod = "day" | "week" | "month" | "quarter" | "year"
export type TrendBucket = ModuleBlocks & { label: string; from: string; to: string; overall: number | null }
export type ScoreTrend = { scope: ScoreScope; id: string; name: string; period: TrendPeriod; buckets: TrendBucket[] }

/**
 * `left`: a person who has since left (deactivated); their name already carries the "(left)" tag.
 * `inactive`: a store that has been switched off but still has work in the window; its name carries "(inactive)".
 */
export type ScoreReportRow = ModuleBlocks & {
    id: string
    name: string
    department: string
    role?: string
    left?: boolean
    inactive?: boolean
    overall: number | null
    totalDue: number
    rankable: boolean
}

/** Ids of the catch-all rows: work with no department (Departments), with no assignee (People), with no store (Stores). */
export const NO_DEPARTMENT_ROW_ID = "no-department"
export const UNASSIGNED_ROW_ID = "unassigned"
export const NO_STORE_ROW_ID = "no-store"
export type ScoreReport = {
    from: string
    to: string
    generatedAt: string
    departments: ScoreReportRow[]
    people: ScoreReportRow[]
    stores: ScoreReportRow[]
    /** Left out when only the stores were asked for (stores=only). Everything in the window in one row (the whole organisation, or a head's own department): each run, ticket and delegation counted once. */
    total?: ScoreReportRow
    notes: string[]
}

export const SCORE_REPORT_NOTES = [
    "Checklist: runs are counted the same way on every page. A run is due when its cutoff has passed or it is completed; a run still open before its cutoff is in neither side and never earns partial credit. Completion = completed / due. On time = completed before the cutoff / completed. Met deadline = completed before the cutoff / due.",
    "Checklist compliance is pooled: weighted good answers / weighted checked answers (critical questions count double, a sent-back question is a fail, not applicable is neutral). It is never an average of people's percentages. A person's compliance covers the answers credited to them, a department's the answers credited to its people, a store's and the organisation's every checked answer on their runs.",
    "A person is scored on every checklist run assigned to them. A department, a store and the whole organisation count each run once, however many people share it, so a department can differ from the sum of its people. A daily run left unfinished on a holiday that no extra working day covers is not counted. Runs of a deleted checklist are not counted; a paused checklist keeps its past runs.",
    "Tickets: a ticket counts when its due time falls in the window; a ticket with no due time is never counted, even if closed. Completion = closed / due. Not done = due - closed, so a ticket waiting for approval is not done until approved. On time is judged from when it was handed in (else closed), so a slow approval does not make the worker late. Compliance = (closed on time + handed in on time and waiting) / due.",
    "Delegations: real delegations only (no subtasks, no issues), counted when due in the window. Completion = done / due. Not done = due - done, waiting for approval included until approved. Compliance = (done on time + handed in on time and waiting) / due (handed-in time, else approval time, else last update). Score is weighted by status (to do 0, in progress 25, waiting approval 75, done 100). Drafts never count.",
    "On time (of finished): of the items that were finished (runs, tickets, delegations), the share finished before their deadline. Met deadline counts unfinished late items as misses too, so it can be lower.",
    "Overall score: completion and compliance of every module with something due, counted equally and averaged before any rounding. A row is rankable only with at least 5 items due.",
    "Nothing is dropped: tickets and delegations with no department sit on the No department row, work with no assignee sits on the Unassigned row of People, and people who have left keep their own row (marked left) for the period.",
    "Stores: checklist runs are scored on the store they belong to, tickets on their store, and delegations on the store of their department. Work with no store (a ticket with no store, a delegation whose department has no store) sits on the Other / no store row, and a switched-off store that still has work keeps its row (marked inactive), so All stores adds up to the whole organisation.",
]

const sum = <T,>(rows: readonly T[], pick: (r: T) => number) => rows.reduce((total, r) => total + pick(r), 0)

const EMPTY_METRICS: ReportMetrics = {
    assigned: 0, completed: 0, completionPct: null, onTime: 0, onTimePct: null, onTimeOfFinishedPct: null, metDeadlinePct: null, due: 0, open: 0, missed: 0,
    submitted: 0, approved: 0, sentBack: 0, questionsDone: 0, notApplicable: 0, answersChecked: 0, compliancePct: null, weightedGood: 0, weightedScored: 0,
}

// Checklist block for one person, department, store or the whole organisation. `m` is already pooled and
// de-duplicated by the checklist report (a shared run counts once for a group), so this only renames.
const foldChecklist = (m: ReportMetrics | null | undefined): ChecklistScore => {
    const r = m ?? EMPTY_METRICS
    return {
        score: r.compliancePct ?? r.completionPct,
        completionPct: r.completionPct,
        compliancePct: r.compliancePct,
        onTimePct: r.onTimeOfFinishedPct,
        onTimeOfFinishedPct: r.onTimeOfFinishedPct,
        metDeadlinePct: r.metDeadlinePct,
        onTime: r.onTime,
        due: r.due,
        completed: r.completed,
        done: r.completed,
        missed: r.missed,
        notDone: notDone(r.due, r.completed),
        late: lateOf(r.completed, r.onTime),
        open: r.open,
        submitted: r.submitted,
        approved: r.approved,
        answersChecked: r.answersChecked,
        weightedGood: r.weightedGood,
        weightedScored: r.weightedScored,
    }
}

type TaskLike = { status: string; dueDate: Date | null; finishedAt: Date | null }
type TicketLike = { status: string; tatDueAt: Date | null; closedAt: Date | null; submittedAt: Date | null }

// Delegations: only what has come due (or is already done). Drafts are private and never count.
const foldTasks = (rows: readonly TaskLike[], now: Date): DelegationScore => {
    const due = rows.filter((t) => t.status !== "draft" && (t.status === "done" || (t.dueDate !== null && t.dueDate < now)))
    const weighted = sum(due, (t) => TASK_WEIGHT[t.status] ?? 0)
    const done = due.filter((t) => t.status === "done")
    // Done with no due date or no finish time on record cannot be late.
    const onTime = done.filter((t) => !t.dueDate || !t.finishedAt || t.finishedAt <= t.dueDate).length
    // Handed in by the due date and waiting for a reviewer: the assignee was on time, so compliance
    // counts it. Completion does not (it is not done yet), and it is never overdue.
    const waitingOnTime = due.filter((t) => t.status === "pending_approval" && t.dueDate !== null && t.finishedAt !== null && t.finishedAt <= t.dueDate).length
    return {
        score: due.length ? round1((weighted / due.length) * 100) : null,
        completionPct: pct(done.length, due.length),
        compliancePct: pct(onTime + waitingOnTime, due.length),
        onTimePct: onTimeOfFinishedPct(onTime, done.length),
        onTimeOfFinishedPct: onTimeOfFinishedPct(onTime, done.length),
        metDeadlinePct: metDeadlinePct(onTime + waitingOnTime, due.length),
        due: due.length,
        done: done.length,
        notDone: notDone(due.length, done.length),
        onTime,
        late: lateOf(done.length, onTime),
        waitingOnTime,
        // One overdue rule for delegations everywhere (list, dashboard summary, ownerStats): past due and
        // not done, draft or waiting for approval. Handed-in work has stopped the assignee's clock;
        // on hold still counts.
        overdue: due.filter((t) => !OVERDUE_EXEMPT_STATUSES.has(t.status) && t.dueDate !== null && t.dueDate < now).length,
    }
}

// Tickets: completion is the share of due tickets closed, compliance the share handed in on or before
// their due time (closed, or waiting for approval).
const foldTickets = (rows: readonly TicketLike[], now: Date): TicketScore => {
    const due = rows.filter((t) => t.status === "CLOSED" || (t.tatDueAt !== null && t.tatDueAt < now))
    const closed = due.filter((t) => t.status === "CLOSED")
    // Judged from when the work was handed in, so a slow approval doesn't make the worker late. Tickets
    // closed before the hand-in time was recorded fall back to their closing time.
    const onTime = closed.filter((t) => {
        const finished = t.submittedAt ?? t.closedAt
        return finished && t.tatDueAt && finished <= t.tatDueAt
    }).length
    // Handed in on time and waiting for approval: on time for compliance, not closed for completion.
    const waitingOnTime = due.filter((t) => t.status === "PENDING_APPROVAL" && t.submittedAt !== null && t.tatDueAt !== null && t.submittedAt <= t.tatDueAt).length
    const compliancePct = pct(onTime + waitingOnTime, due.length)
    // Late = closed, but after the due time. Tickets still open are "not done" (due - closed), never
    // late as well, so the two never count the same ticket twice.
    return {
        score: compliancePct,
        completionPct: pct(closed.length, due.length),
        compliancePct,
        onTimePct: onTimeOfFinishedPct(onTime, closed.length),
        onTimeOfFinishedPct: onTimeOfFinishedPct(onTime, closed.length),
        metDeadlinePct: metDeadlinePct(onTime + waitingOnTime, due.length),
        due: due.length,
        closed: closed.length,
        done: closed.length,
        notDone: notDone(due.length, closed.length),
        onTime,
        late: lateOf(closed.length, onTime),
        waitingOnTime,
    }
}

/**
 * Overall score for one set of module blocks, from the RAW ratios behind the percentages (so nothing is
 * rounded before it is averaged): completion and compliance of every module with something due.
 */
const overallOfBlocks = (b: ModuleBlocks): number | null =>
    overallOf([
        { due: b.checklist.due, completion: rawPct(b.checklist.completed, b.checklist.due), compliance: rawPct(b.checklist.weightedGood, b.checklist.weightedScored) },
        { due: b.ticket.due, completion: rawPct(b.ticket.done, b.ticket.due), compliance: rawPct(b.ticket.onTime + b.ticket.waitingOnTime, b.ticket.due) },
        { due: b.delegation.due, completion: rawPct(b.delegation.done, b.delegation.due), compliance: rawPct(b.delegation.onTime + b.delegation.waitingOnTime, b.delegation.due) },
    ])
const totalDueOf = (b: ModuleBlocks) => b.checklist.due + b.ticket.due + b.delegation.due
const rankFields = (b: ModuleBlocks) => ({ overall: overallOfBlocks(b), totalDue: totalDueOf(b), rankable: isRankable(totalDueOf(b)) })


// When a task was finished: handed in, else approved, else last touched.
const finishedAt = (t: { submittedAt: Date | null; verifiedAt: Date | null; updatedAt: Date }) => t.submittedAt ?? t.verifiedAt ?? t.updatedAt

// What counts as a delegation in every score query: not deleted, category 'delegation' (issues are
// reported elsewhere) and not a subtask (its parent already counts). The same rule as the task module's
// ownerStats, complianceReport and summary, so a score never counts work those lists leave out.
const DELEGATION_ONLY = and(isNull(tasks.deletedAt), eq(tasks.category, "delegation"), isNull(tasks.parentTaskId))

const taskCols = { status: tasks.status, dueDate: tasks.dueDate, submittedAt: tasks.submittedAt, verifiedAt: tasks.verifiedAt, updatedAt: tasks.updatedAt }
const ticketCols = { status: tickets.status, tatDueAt: tickets.tatDueAt, closedAt: tickets.closedAt, submittedAt: tickets.submittedAt }

// Push-based grouping: one array per key, filled in place (no copy per row).
const groupRows = <T,>(rows: readonly T[], keyOf: (r: T) => string | null | undefined) => {
    const map = new Map<string, T[]>()
    for (const r of rows) {
        const k = keyOf(r)
        if (!k) continue
        const list = map.get(k)
        if (list) list.push(r)
        else map.set(k, [r])
    }
    return map
}

const blocksFor = (now: Date, c: ReportMetrics | null | undefined, tk: readonly TicketLike[], ts: readonly TaskLike[]): ModuleBlocks => ({
    checklist: foldChecklist(c), ticket: foldTickets(tk, now), delegation: foldTasks(ts, now),
})

const rowFor = (now: Date, id: string, name: string, department: string, role: string | undefined, c: ReportMetrics | null | undefined, tk: readonly TicketLike[], ts: readonly TaskLike[]): ScoreReportRow => {
    const blocks = blocksFor(now, c, tk, ts)
    return { id, name, department, role, ...blocks, ...rankFields(blocks) }
}
const hasData = (r: ScoreReportRow) => r.checklist.due > 0 || r.ticket.due > 0 || r.delegation.due > 0

const windowOf = (from: string, to: string) => {
    const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
    return { start: new Date(Date.parse(`${from}T00:00:00.000Z`) - offsetMs), end: new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS - offsetMs) }
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// How a window is cut for the trend. Days and weeks show seven days, a month shows its weeks, a quarter
// and a year show calendar months. Never more than twelve buckets.
const bucketsFor = (period: TrendPeriod, from: string, to: string): { label: string; from: string; to: string }[] => {
    const fromMs = Date.parse(`${from}T00:00:00.000Z`)
    const toMs = Date.parse(`${to}T00:00:00.000Z`)
    const out: { label: string; from: string; to: string }[] = []
    if (period === "day" || period === "week") {
        // The last seven days ending on the window's last day (a week is exactly its own seven days).
        for (let i = 6; i >= 0; i--) {
            const d = toMs - i * DAY_MS
            out.push({ label: new Date(d).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }), from: ymd(d), to: ymd(d) })
        }
        return out
    }
    if (period === "month") {
        for (let start = fromMs, n = 1; start <= toMs && n <= 6; start += 7 * DAY_MS, n++) {
            const end = Math.min(start + 6 * DAY_MS, toMs)
            out.push({ label: `${new Date(start).getUTCDate()}-${new Date(end).getUTCDate()}`, from: ymd(start), to: ymd(end) })
        }
        return out
    }
    // quarter and year: calendar months inside the window
    const cursor = new Date(fromMs)
    cursor.setUTCDate(1)
    while (cursor.getTime() <= toMs && out.length < 12) {
        const start = Math.max(cursor.getTime(), fromMs)
        const nextMonth = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
        const end = Math.min(nextMonth - DAY_MS, toMs)
        out.push({ label: MONTH_NAMES[cursor.getUTCMonth()], from: ymd(start), to: ymd(end) })
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
    return out
}

// `checklistFor` returns the one pooled checklist figure for the scope (null: nothing counted).
type Target = { name: string; taskWhere: SQL | undefined; ticketWhere: SQL | undefined; checklistFor: (viewer: AccessTokenPayload, from: string, to: string) => Promise<ReportMetrics | null> }

// A person's own row: the runs assigned to them and the answers credited to them.
const personMetrics = (viewer: AccessTokenPayload, from: string, to: string, userId: string) =>
    checklistReportService.build(viewer, { from, to, groupBy: "person" }, userId).then((r) => r.people.find((p) => p.userId === userId) ?? null)
// Every run in scope once, every checked answer on them (org, and a store when `storeId` is given).
const totalsMetrics = (viewer: AccessTokenPayload, from: string, to: string, storeId?: string) =>
    checklistReportService.build(viewer, { from, to, groupBy: "department", storeId }).then((r) => r.totals)
// A department's row: each run once, the answers credited to its people.
const departmentMetrics = (viewer: AccessTokenPayload, from: string, to: string, departmentId: string) =>
    checklistReportService.build(viewer, { from, to, groupBy: "department", departmentId }).then((r) => r.departments.find((d) => d.departmentId === departmentId) ?? null)

export type OrgCounts = {
    stores: { active: number; inactive: number }
    departments: { active: number; inactive: number }
    employees: { active: number; joinedLast30Days: number }
    /** Active departments with at least one active Manager or Senior (a department head). */
    departmentsWithLead: number
}

export const scoreService = {
    /**
     * The four counts behind the Overview's "Your organisation" tiles, in four small aggregate queries, so the
     * page no longer downloads the whole roster just to count it. ADMIN and PC only, like the roster itself.
     */
    async orgCounts(viewer: AccessTokenPayload): Promise<OrgCounts> {
        if (viewer.role !== "ADMIN" && viewer.role !== "PC") throw AppError.forbidden()
        const joinedSince = new Date(Date.now() - 30 * DAY_MS)
        const [[storeRow], [deptRow], [userRow], [leadRow]] = await Promise.all([
            db.select({ total: sql<number>`COUNT(*)`, active: sql<number>`COALESCE(SUM(${stores.isActive}), 0)` }).from(stores),
            db.select({ total: sql<number>`COUNT(*)`, active: sql<number>`COALESCE(SUM(${departments.isActive}), 0)` }).from(departments),
            db
                .select({ active: sql<number>`COALESCE(SUM(${users.isActive}), 0)`, joined: sql<number>`COALESCE(SUM(CASE WHEN ${users.isActive} = 1 AND ${users.createdAt} >= ${joinedSince} THEN 1 ELSE 0 END), 0)` })
                .from(users),
            db
                .select({ total: sql<number>`COUNT(*)` })
                .from(departments)
                .where(and(eq(departments.isActive, true), sql`EXISTS (SELECT 1 FROM ${users} hd WHERE hd.departmentId = ${departments.id} AND hd.isActive = 1 AND hd.role IN ('MANAGER', 'SENIOR'))`)),
        ])
        const storesActive = Number(storeRow?.active ?? 0)
        const departmentsActive = Number(deptRow?.active ?? 0)
        return {
            stores: { active: storesActive, inactive: Number(storeRow?.total ?? 0) - storesActive },
            departments: { active: departmentsActive, inactive: Number(deptRow?.total ?? 0) - departmentsActive },
            employees: { active: Number(userRow?.active ?? 0), joinedLast30Days: Number(userRow?.joined ?? 0) },
            departmentsWithLead: Number(leadRow?.total ?? 0),
        }
    },

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
                checklistFor: (v, from, to) => personMetrics(v, from, to, id),
            }
        }

        // The whole organisation in one figure per module: every delegation, ticket and checklist run. ADMIN and PC only.
        if (scope === "org") {
            if (!orgWide) throw AppError.forbidden()
            return {
                name: "Whole organisation",
                taskWhere: undefined,
                ticketWhere: undefined,
                checklistFor: (v, from, to) => totalsMetrics(v, from, to),
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
                checklistFor: (v, from, to) => departmentMetrics(v, from, to, id),
            }
        }

        if (!orgWide) throw AppError.forbidden()
        const [store] = await db.select({ name: stores.name }).from(stores).where(eq(stores.id, id)).limit(1)
        if (!store) throw AppError.notFound("Store not found")
        return {
            name: store.name,
            // Delegations have no store of their own, so they follow the store of their department (the same
            // rule as the delegation list's store filter, so the drill link opens exactly these).
            taskWhere: inArray(tasks.departmentId, db.select({ id: departments.id }).from(departments).where(eq(departments.storeId, id))),
            ticketWhere: eq(tickets.storeId, id),
            checklistFor: (v, from, to) => totalsMetrics(v, from, to, id),
        }
    },

    /** `from` and `to` are org-local days (YYYY-MM-DD), both included. */
    async forScope(viewer: AccessTokenPayload, scope: ScoreScope, id: string, from: string, to: string, resolved?: Target): Promise<Scores> {
        const target = resolved ?? (await this.resolve(viewer, scope, id))
        const { start, end } = windowOf(from, to)
        const now = new Date()

        // The checklist report is the heaviest query. If it fails the delegation and ticket scores still
        // show, and the checklist tile simply reads as no data, instead of the whole card erroring.
        const [checklistMetrics, taskRows, ticketRows] = await Promise.all([
            target.checklistFor(viewer, from, to).catch((err: unknown) => {
                console.error("scores: checklist part failed", err)
                return null
            }),
            db
                .select(taskCols)
                .from(tasks)
                .where(and(DELEGATION_ONLY, gte(tasks.dueDate, start), lt(tasks.dueDate, end), target.taskWhere)),
            db
                .select(ticketCols)
                .from(tickets)
                .where(and(isNull(tickets.deletedAt), gte(tickets.tatDueAt, start), lt(tickets.tatDueAt, end), target.ticketWhere)),
        ])

        const blocks = blocksFor(now, checklistMetrics, ticketRows, taskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) })))
        return { scope, id, name: target.name, from, to, ...blocks, ...rankFields(blocks) }
    },

    /**
     * The same scores over time, for the Trend view: the selected window cut into a few buckets (7 days
     * for a day or a week, weeks for a month, months for a quarter or a year), each scored with exactly
     * the rules of `forScope`, so a bucket always agrees with the card. Access is checked once.
     */
    async trend(viewer: AccessTokenPayload, scope: ScoreScope, id: string, period: TrendPeriod, from: string, to: string): Promise<ScoreTrend> {
        const target = await this.resolve(viewer, scope, id)
        const buckets = bucketsFor(period, from, to)
        const out: TrendBucket[] = []
        // A few at a time, so one trend never floods the database pool.
        for (let i = 0; i < buckets.length; i += 4) {
            const slice = buckets.slice(i, i + 4)
            const scored = await Promise.all(slice.map((b) => this.forScope(viewer, scope, id, b.from, b.to, target)))
            scored.forEach((s, k) => out.push({ label: slice[k].label, from: slice[k].from, to: slice[k].to, checklist: s.checklist, ticket: s.ticket, delegation: s.delegation, overall: s.overall }))
        }
        return { scope, id, name: target.name, period, buckets: out }
    },

    /**
     * Every department and every person the viewer may see, scored for one window: the table behind the
     * export and the Scorecard. ADMIN/PC see the whole organisation, MANAGER/SENIOR their own department,
     * nobody else. `parts.stores` adds every store (ADMIN/PC only); `parts.people: false` skips the
     * departments and people, so the store view can be fetched on its own.
     */
    async report(viewer: AccessTokenPayload, from: string, to: string, parts: { people?: boolean; stores?: boolean } = {}): Promise<ScoreReport> {
        const orgWide = viewer.role === "ADMIN" || viewer.role === "PC"
        const hod = viewer.role === "MANAGER" || viewer.role === "SENIOR"
        if (!orgWide && !hod) throw AppError.forbidden()
        const wantPeople = parts.people !== false
        const wantStores = parts.stores === true && orgWide
        const [peopleAndDepts, storeRows] = await Promise.all([
            wantPeople ? this.peopleAndDepartments(viewer, from, to, orgWide) : Promise.resolve({ departments: [], people: [], total: undefined }),
            wantStores ? this.storeRows(viewer, from, to) : Promise.resolve([]),
        ])
        return { from, to, generatedAt: new Date().toISOString(), departments: peopleAndDepts.departments, people: peopleAndDepts.people, stores: storeRows, total: peopleAndDepts.total, notes: SCORE_REPORT_NOTES }
    },

    async peopleAndDepartments(viewer: AccessTokenPayload, from: string, to: string, orgWide: boolean): Promise<{ departments: ScoreReportRow[]; people: ScoreReportRow[]; total: ScoreReportRow }> {
        // A head with no department on the record sees nothing, never everyone.
        const onlyDepartment = orgWide ? undefined : viewer.departmentId ?? "no-department"
        const { start, end } = windowOf(from, to)
        const now = new Date()
        const taskWhere = and(DELEGATION_ONLY, gte(tasks.dueDate, start), lt(tasks.dueDate, end), onlyDepartment ? eq(tasks.departmentId, onlyDepartment) : undefined)

        const [checklist, peopleRows, deptRows, taskRows, extraAssigneeRows, ticketRows] = await Promise.all([
            checklistReportService.build(viewer, { from, to, groupBy: "both" }).catch((err: unknown) => {
                console.error("scores: checklist report failed", err)
                return null
            }),
            db
                .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, departmentId: users.departmentId })
                .from(users)
                .where(and(eq(users.isActive, true), onlyDepartment ? eq(users.departmentId, onlyDepartment) : undefined)),
            db.select({ id: departments.id, name: departments.name }).from(departments).where(onlyDepartment ? eq(departments.id, onlyDepartment) : undefined),
            // Every delegation due in the window, assigned or not: a department is scored on all of its
            // work (the same rule as the department card), a person only on what is theirs (below).
            db
                .select({ id: tasks.id, ...taskCols, assigneeId: tasks.assigneeId, departmentId: tasks.departmentId })
                .from(tasks)
                .where(taskWhere),
            // Additional assignees are judged on a shared delegation too, the same as the person card.
            db
                .select({ taskId: taskAdditionalAssignees.taskId, userId: taskAdditionalAssignees.userId })
                .from(taskAdditionalAssignees)
                .innerJoin(tasks, eq(tasks.id, taskAdditionalAssignees.taskId))
                .where(taskWhere),
            // Every ticket due in the window, assigned or not, for the same reason as delegations above.
            db
                .select({ ...ticketCols, assigneeId: tickets.assigneeId, departmentId: tickets.departmentId })
                .from(tickets)
                .where(and(isNull(tickets.deletedAt), gte(tickets.tatDueAt, start), lt(tickets.tatDueAt, end), onlyDepartment ? eq(tickets.departmentId, onlyDepartment) : undefined)),
        ])

        const deptName = new Map(deptRows.map((d) => [d.id, d.name]))
        const nameOfDept = (id: string | null) => (id ? deptName.get(id) ?? "Unknown" : "No department")
        const checklistByPerson = new Map((checklist?.people ?? []).map((p) => [p.userId, p]))
        // Keyed by department id; the checklist report's "No department" group has a null id.
        const checklistByDept = new Map((checklist?.departments ?? []).map((d) => [d.departmentId, d]))

        const reportTasks = taskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) }))
        const taskById = new Map(reportTasks.map((t) => [t.id, t]))
        const tasksByPerson = groupRows(reportTasks, (t) => t.assigneeId)
        for (const extra of extraAssigneeRows) {
            const task = taskById.get(extra.taskId)
            // Someone listed as both the main and an additional assignee is counted once.
            if (!task || task.assigneeId === extra.userId) continue
            const list = tasksByPerson.get(extra.userId)
            if (list) list.push(task)
            else tasksByPerson.set(extra.userId, [task])
        }
        const ticketsByPerson = groupRows(ticketRows, (t) => t.assigneeId)
        const tasksByDept = groupRows(reportTasks, (t) => t.departmentId)
        const ticketsByDept = groupRows(ticketRows, (t) => t.departmentId)

        // People who have left but still have work in the window: their runs are inside the department
        // totals, so they get a row of their own (marked left) instead of vanishing from the list.
        const workIds = new Set<string>()
        for (const p of checklist?.people ?? []) workIds.add(p.userId)
        for (const [id] of tasksByPerson) workIds.add(id)
        for (const [id] of ticketsByPerson) workIds.add(id)
        const known = new Set(peopleRows.map((p) => p.id))
        const missingIds = [...workIds].filter((id) => !known.has(id))
        const formerRows = missingIds.length
            ? await db
                .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, departmentId: users.departmentId })
                .from(users)
                .where(and(inArray(users.id, missingIds), eq(users.isActive, false), onlyDepartment ? eq(users.departmentId, onlyDepartment) : undefined))
            : []

        const fullName = (p: { firstName: string; lastName: string | null }) => `${p.firstName} ${p.lastName ?? ""}`.trim()
        const personRow = (p: (typeof peopleRows)[number], left: boolean): ScoreReportRow => {
            const c = checklistByPerson.get(p.id)
            const row = rowFor(now, p.id, left ? `${fullName(p)} (left)` : fullName(p), nameOfDept(p.departmentId), p.role, c, ticketsByPerson.get(p.id) ?? [], tasksByPerson.get(p.id) ?? [])
            return left ? { ...row, left: true } : row
        }

        // Work nobody is assigned to: no main assignee and no additional one. It belongs to a department
        // (or to none), so the department rows already count it; this row makes People add up too.
        const extraIds = new Set(extraAssigneeRows.map((e) => e.taskId))
        const unassignedTasks = reportTasks.filter((t) => !t.assigneeId && !extraIds.has(t.id))
        const unassignedTickets = ticketRows.filter((t) => !t.assigneeId)
        const unassigned = rowFor(now, UNASSIGNED_ROW_ID, "Unassigned", "", undefined, null, unassignedTickets, unassignedTasks)

        const people = [...peopleRows.map((p) => personRow(p, false)), ...formerRows.map((p) => personRow(p, true)), unassigned]
            .filter(hasData)
            .sort((a, b) => (a.id === UNASSIGNED_ROW_ID ? 1 : 0) - (b.id === UNASSIGNED_ROW_ID ? 1 : 0) || a.department.localeCompare(b.department) || a.name.localeCompare(b.name))

        const depts = deptRows.map((d) => {
            const c = checklistByDept.get(d.id)
            return rowFor(now, d.id, d.name, d.name, undefined, c, ticketsByDept.get(d.id) ?? [], tasksByDept.get(d.id) ?? [])
        })
        // Work with no department (and the checklist runs of people with none) sits on one more row, so the
        // departments add up to the organisation. A head only sees their own department, so no such row.
        if (!onlyDepartment) {
            const c = checklistByDept.get(null)
            depts.push(rowFor(now, NO_DEPARTMENT_ROW_ID, "No department", "No department", undefined, c, ticketRows.filter((t) => !t.departmentId), reportTasks.filter((t) => !t.departmentId)))
        }

        // Everything once: each run (checklist totals), ticket and delegation counted a single time.
        const total = rowFor(now, "total", onlyDepartment ? deptName.get(onlyDepartment) ?? "Your department" : "Whole organisation", "", undefined, checklist?.totals, ticketRows, reportTasks)

        return { departments: depts.filter(hasData).sort((a, b) => (a.id === NO_DEPARTMENT_ROW_ID ? 1 : 0) - (b.id === NO_DEPARTMENT_ROW_ID ? 1 : 0) || a.name.localeCompare(b.name)), people, total }
    },

    /**
     * Every store with work in the window, scored with the store card's rules (checklist runs of the store,
     * tickets of the store, delegations following the store of their department), in one grouped pass: one
     * checklist build split by store, one ticket and one delegation query, grouped in memory.
     *
     * Nothing is dropped, so the stores add up to the whole organisation: a switched-off store that still has
     * work keeps its row (`inactive: true`, "(inactive)" in the name), and tickets with no store and
     * delegations whose department has no store (or that have no department) sit on the `no-store` row.
     * Checklist runs always belong to a store.
     */
    async storeRows(viewer: AccessTokenPayload, from: string, to: string): Promise<ScoreReportRow[]> {
        const { start, end } = windowOf(from, to)
        const now = new Date()
        const [all, checklist, taskRows, ticketRows] = await Promise.all([
            db.select({ id: stores.id, name: stores.name, isActive: stores.isActive }).from(stores),
            checklistReportService.build(viewer, { from, to, groupBy: "person" }, undefined, { byStore: true }).catch((err: unknown) => {
                console.error("scores: store checklist report failed", err)
                return null
            }),
            db
                .select({ ...taskCols, storeId: departments.storeId })
                .from(tasks)
                .leftJoin(departments, eq(departments.id, tasks.departmentId))
                .where(and(DELEGATION_ONLY, gte(tasks.dueDate, start), lt(tasks.dueDate, end))),
            db
                .select({ ...ticketCols, storeId: tickets.storeId })
                .from(tickets)
                .where(and(isNull(tickets.deletedAt), gte(tickets.tatDueAt, start), lt(tickets.tatDueAt, end))),
        ])

        const checklistByStore = new Map((checklist?.storeTotals ?? []).map((s) => [s.storeId, s]))
        const reportTasks = taskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) }))
        const tasksByStore = groupRows(reportTasks, (t) => t.storeId)
        const ticketsByStore = groupRows(ticketRows, (t) => t.storeId)

        const rows = all
            .map((s) => ({
                ...rowFor(now, s.id, s.isActive ? s.name : `${s.name} (inactive)`, "", undefined, checklistByStore.get(s.id), ticketsByStore.get(s.id) ?? [], tasksByStore.get(s.id) ?? []),
                ...(s.isActive ? {} : { inactive: true }),
            }))
            .filter(hasData)
            .sort((a, b) => a.name.localeCompare(b.name))
        const noStore = rowFor(now, NO_STORE_ROW_ID, "Other / no store", "", undefined, null, ticketRows.filter((t) => !t.storeId), reportTasks.filter((t) => !t.storeId))
        return hasData(noStore) ? [...rows, noStore] : rows
    },
}
