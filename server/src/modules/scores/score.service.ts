import { and, eq, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { departments, stores, users } from "../../db/schema/core.js"
import { taskAdditionalAssignees, tasks } from "../../db/schema/task.js"
import { tickets } from "../../db/schema/ticket.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { SCORE_REPORT_NOTES } from "./scoreNotes.js"
import { checklistReportService, type DefinitionRow, type ReportMetrics } from "../checklistReports/checklistReport.service.js"
import {
    foldChecklist,
    foldTasks,
    foldTickets,
    rankFields,
    type ChecklistScore,
    type DelegationScore,
    type ModuleBlocks,
    type ScoreWindow,
    type TaskLike,
    type TicketLike,
    type TicketScore,
} from "./scoreBlocks.js"

// The block types live in scoreBlocks.ts (pure, testable); re-exported so older imports keep working.
export type { ChecklistScore, DelegationScore, ModuleBlocks, TicketScore }

const DAY_MS = 86_400_000

export type ScoreScope = "person" | "department" | "store" | "org"

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
    /** People rows only: the user's current department id (null when they have none). */
    departmentId?: string | null
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

export { SCORE_REPORT_NOTES }

type Finished = { submittedAt: Date | null; verifiedAt: Date | null; updatedAt: Date }

// When a task was finished: handed in, else approved, else last touched.
const finishedAt = (t: Finished) => t.submittedAt ?? t.verifiedAt ?? t.updatedAt

// What counts as a delegation in every score query: not deleted, category 'delegation' (issues are
// reported elsewhere) and not a subtask (its parent already counts). The same rule as the task module's
// ownerStats, complianceReport and summary, so a score never counts work those lists leave out.
const DELEGATION_ONLY = and(isNull(tasks.deletedAt), eq(tasks.category, "delegation"), isNull(tasks.parentTaskId))

const taskCols = { status: tasks.status, dueDate: tasks.dueDate, submittedAt: tasks.submittedAt, verifiedAt: tasks.verifiedAt, updatedAt: tasks.updatedAt }
const ticketCols = { status: tickets.status, tatDueAt: tickets.tatDueAt, closedAt: tickets.closedAt, submittedAt: tickets.submittedAt, reopenCount: tickets.reopenCount }

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

type FoldContext = { now: Date; win: ScoreWindow }

const blocksFor = (ctx: FoldContext, c: ReportMetrics | null | undefined, tk: readonly TicketLike[], ts: readonly TaskLike[]): ModuleBlocks => ({
    checklist: foldChecklist(c), ticket: foldTickets(tk, ctx.now, ctx.win), delegation: foldTasks(ts, ctx.now, ctx.win),
})

const rowFor = (ctx: FoldContext, id: string, name: string, department: string, role: string | undefined, c: ReportMetrics | null | undefined, tk: readonly TicketLike[], ts: readonly TaskLike[]): ScoreReportRow => {
    const blocks = blocksFor(ctx, c, tk, ts)
    return { id, name, department, role, ...blocks, ...rankFields(blocks) }
}
const hasData = (r: ScoreReportRow) => r.checklist.due > 0 || r.ticket.due > 0 || r.delegation.due > 0

/** The window as instants: `start` is the first moment of `from`, `end` the first moment after `to` (org-local days). */
export const windowOf = (from: string, to: string): ScoreWindow => {
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

// A person's own row: the runs assigned to them and the answers credited to them on those runs.
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

/** Narrows a report to one store, one department and/or one checklist recurrence (the checklist part only). */
export type ScoreFilter = { storeId?: string; departmentId?: string; recurrence?: string }

/** Everything the people / departments pass produces, for the report and for the explorer. */
export type ScoreCollection = {
    departments: ScoreReportRow[]
    people: ScoreReportRow[]
    /** Everything once (the organisation, or a head's own department): each run, ticket and delegation a single time. */
    total: ScoreReportRow
    /** Work nobody is assigned to (tickets, delegations and checklist runs), inside the same scope. */
    unassigned: ScoreReportRow
    /** Counted checklist runs that are also assigned to someone else, by person id. */
    sharedRunsByPerson: Map<string, number>
    /** Counted checklist runs shared with another department, by department id (NO_DEPARTMENT_ROW_ID for none). */
    sharedRunsByDepartment: Map<string, number>
    checklistSharing: { runsWithSeveralAssignees: number; runsAcrossDepartments: number; runsWithoutAssignee: number }
    /** Only with `definitions: true`: one row per checklist in scope. */
    definitions?: DefinitionRow[]
    /** The department the scope was held to, when one was (a head's own, or the drill-down department). */
    onlyDepartment?: string
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
        const win = windowOf(from, to)
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
                .where(and(DELEGATION_ONLY, gte(tasks.dueDate, win.start), lt(tasks.dueDate, win.end), target.taskWhere)),
            db
                .select(ticketCols)
                .from(tickets)
                .where(and(isNull(tickets.deletedAt), isNull(tickets.declinedAt), gte(tickets.tatDueAt, win.start), lt(tickets.tatDueAt, win.end), target.ticketWhere)),
        ])

        const blocks = blocksFor({ now, win }, checklistMetrics, ticketRows, taskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) })))
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
        const c = await this.collect(viewer, from, to, orgWide)
        return { departments: c.departments, people: c.people, total: c.total }
    },

    /**
     * The one pass behind the departments, people, Unassigned row and total, with an optional store /
     * department / recurrence filter for the explorer's drill-down.
     *
     * Rules (documented in the report notes):
     *  - A department row and the total use DEPARTMENT scope: the work filed under that department.
     *  - A person row uses the person's WHOLE numbers (the same as their own score card): their tickets,
     *    delegations (main and additional assignee) and checklist runs wherever they sit, even when a
     *    department head is looking, as long as the head may see that person. So a head's person rows can
     *    add up to more than the head's department total, exactly as the person card does.
     *  - Work nobody is assigned to (including checklist runs with nobody on them) sits on the Unassigned row.
     * With a `storeId` filter every module is narrowed to that store (person rows too: it is a drill-down).
     * `recurrence` narrows only the checklist part.
     */
    async collect(viewer: AccessTokenPayload, from: string, to: string, orgWide: boolean, filter: ScoreFilter = {}, want: { definitions?: boolean } = {}): Promise<ScoreCollection> {
        // A head with no department on the record sees nothing, never everyone.
        const onlyDepartment = orgWide ? filter.departmentId : viewer.departmentId ?? NO_DEPARTMENT_ROW_ID
        const win = windowOf(from, to)
        const now = new Date()
        const ctx: FoldContext = { now, win }
        // Delegations follow the store of their department; tickets have their own store.
        const storeTaskFilter = filter.storeId ? inArray(tasks.departmentId, db.select({ id: departments.id }).from(departments).where(eq(departments.storeId, filter.storeId))) : undefined
        const storeTicketFilter = filter.storeId ? eq(tickets.storeId, filter.storeId) : undefined
        const taskWhere = and(DELEGATION_ONLY, gte(tasks.dueDate, win.start), lt(tasks.dueDate, win.end), onlyDepartment ? eq(tasks.departmentId, onlyDepartment) : undefined, storeTaskFilter)
        const ticketWhere = and(isNull(tickets.deletedAt), isNull(tickets.declinedAt), gte(tickets.tatDueAt, win.start), lt(tickets.tatDueAt, win.end), onlyDepartment ? eq(tickets.departmentId, onlyDepartment) : undefined, storeTicketFilter)

        const userCols = { id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, departmentId: users.departmentId, isActive: users.isActive }
        const [checklist, userRows, deptRows, taskRows, extraAssigneeRows, ticketRows] = await Promise.all([
            checklistReportService.build(viewer, { from, to, groupBy: "both", storeId: filter.storeId, departmentId: onlyDepartment, recurrence: filter.recurrence }, undefined, { byDefinition: want.definitions === true }).catch((err: unknown) => {
                console.error("scores: checklist report failed", err)
                return null
            }),
            // Inside one department: everyone on its record, active or not (a former person keeps a row). Otherwise active people.
            db
                .select(userCols)
                .from(users)
                .where(onlyDepartment ? eq(users.departmentId, onlyDepartment) : eq(users.isActive, true)),
            db.select({ id: departments.id, name: departments.name }).from(departments).where(onlyDepartment ? eq(departments.id, onlyDepartment) : undefined),
            // Every delegation due in the window, assigned or not: a department is scored on all of its
            // work (the same rule as the department card), a person on all of theirs (below).
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
                .where(ticketWhere),
        ])

        const peopleRows = userRows.filter((u) => u.isActive)

        // Person rows show the person's whole work. Org-wide the queries above already are that. Inside one
        // department they were cut to the department's filing, so the people's own work is read again by
        // assignee (still inside the window and any store filter), the way the person card reads it.
        let personTaskRows = taskRows
        let personExtraRows = extraAssigneeRows
        let personTicketRows = ticketRows
        if (onlyDepartment) {
            const ids = userRows.map((u) => u.id)
            if (ids.length) {
                const personTaskWhere = and(
                    DELEGATION_ONLY, gte(tasks.dueDate, win.start), lt(tasks.dueDate, win.end), storeTaskFilter,
                    or(inArray(tasks.assigneeId, ids), inArray(tasks.id, db.select({ taskId: taskAdditionalAssignees.taskId }).from(taskAdditionalAssignees).where(inArray(taskAdditionalAssignees.userId, ids)))),
                )
                ;[personTaskRows, personExtraRows, personTicketRows] = await Promise.all([
                    db.select({ id: tasks.id, ...taskCols, assigneeId: tasks.assigneeId, departmentId: tasks.departmentId }).from(tasks).where(personTaskWhere),
                    db
                        .select({ taskId: taskAdditionalAssignees.taskId, userId: taskAdditionalAssignees.userId })
                        .from(taskAdditionalAssignees)
                        .innerJoin(tasks, eq(tasks.id, taskAdditionalAssignees.taskId))
                        .where(and(personTaskWhere, inArray(taskAdditionalAssignees.userId, ids))),
                    db
                        .select({ ...ticketCols, assigneeId: tickets.assigneeId, departmentId: tickets.departmentId })
                        .from(tickets)
                        .where(and(isNull(tickets.deletedAt), isNull(tickets.declinedAt), gte(tickets.tatDueAt, win.start), lt(tickets.tatDueAt, win.end), storeTicketFilter, inArray(tickets.assigneeId, ids))),
                ])
            } else {
                personTaskRows = []
                personExtraRows = []
                personTicketRows = []
            }
        }

        const deptName = new Map(deptRows.map((d) => [d.id, d.name]))
        const nameOfDept = (id: string | null) => (id ? deptName.get(id) ?? "Unknown" : "No department")
        const checklistByPerson = new Map((checklist?.people ?? []).map((p) => [p.userId, p]))
        // Keyed by department id; the checklist report's "No department" group has a null id.
        const checklistByDept = new Map((checklist?.departments ?? []).map((d) => [d.departmentId, d]))

        const deptTasks = taskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) }))
        const personTasks = personTaskRows === taskRows ? deptTasks : personTaskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) }))
        const personTaskById = new Map(personTasks.map((t) => [t.id, t]))
        const tasksByPerson = groupRows(personTasks, (t) => t.assigneeId)
        for (const extra of personExtraRows) {
            const task = personTaskById.get(extra.taskId)
            // Someone listed as both the main and an additional assignee is counted once.
            if (!task || task.assigneeId === extra.userId) continue
            const list = tasksByPerson.get(extra.userId)
            if (list) list.push(task)
            else tasksByPerson.set(extra.userId, [task])
        }
        const ticketsByPerson = groupRows(personTicketRows, (t) => t.assigneeId)
        const tasksByDept = groupRows(deptTasks, (t) => t.departmentId)
        const ticketsByDept = groupRows(ticketRows, (t) => t.departmentId)

        // People who have left but still have work in the window: their runs are inside the department
        // totals, so they get a row of their own (marked left) instead of vanishing from the list.
        const workIds = new Set<string>()
        for (const p of checklist?.people ?? []) workIds.add(p.userId)
        for (const [id] of tasksByPerson) workIds.add(id)
        for (const [id] of ticketsByPerson) workIds.add(id)
        let formerRows: typeof userRows
        if (onlyDepartment) {
            formerRows = userRows.filter((u) => !u.isActive && workIds.has(u.id))
        } else {
            const known = new Set(peopleRows.map((p) => p.id))
            const missingIds = [...workIds].filter((id) => !known.has(id))
            formerRows = missingIds.length ? await db.select(userCols).from(users).where(and(inArray(users.id, missingIds), eq(users.isActive, false))) : []
        }

        const fullName = (p: { firstName: string; lastName: string | null }) => `${p.firstName} ${p.lastName ?? ""}`.trim()
        const personRow = (p: (typeof peopleRows)[number], left: boolean): ScoreReportRow => {
            const c = checklistByPerson.get(p.id)
            const row = rowFor(ctx, p.id, left ? `${fullName(p)} (left)` : fullName(p), nameOfDept(p.departmentId), p.role, c, ticketsByPerson.get(p.id) ?? [], tasksByPerson.get(p.id) ?? [])
            return { ...row, departmentId: p.departmentId, ...(left ? { left: true } : {}) }
        }

        // Work nobody is assigned to: no main assignee and no additional one, and checklist runs with nobody on
        // them. It belongs to a department (or to none), so the department rows already count it; this row
        // makes People add up too. Read from the department-scope rows, like the department rows.
        const extraIds = new Set(extraAssigneeRows.map((e) => e.taskId))
        const unassignedTasks = deptTasks.filter((t) => !t.assigneeId && !extraIds.has(t.id))
        const unassignedTickets = ticketRows.filter((t) => !t.assigneeId)
        const unassigned = rowFor(ctx, UNASSIGNED_ROW_ID, "Unassigned", "", undefined, checklist?.unassigned ?? null, unassignedTickets, unassignedTasks)

        const people = [...peopleRows.map((p) => personRow(p, false)), ...formerRows.map((p) => personRow(p, true)), unassigned]
            .filter(hasData)
            .sort((a, b) => (a.id === UNASSIGNED_ROW_ID ? 1 : 0) - (b.id === UNASSIGNED_ROW_ID ? 1 : 0) || a.department.localeCompare(b.department) || a.name.localeCompare(b.name))

        const depts = deptRows.map((d) => {
            const c = checklistByDept.get(d.id)
            return rowFor(ctx, d.id, d.name, d.name, undefined, c, ticketsByDept.get(d.id) ?? [], tasksByDept.get(d.id) ?? [])
        })
        // Work with no department (and the checklist runs of people with none) sits on one more row, so the
        // departments add up to the organisation. Inside one department there is no such row.
        if (!onlyDepartment) {
            const c = checklistByDept.get(null)
            depts.push(rowFor(ctx, NO_DEPARTMENT_ROW_ID, "No department", "No department", undefined, c, ticketRows.filter((t) => !t.departmentId), deptTasks.filter((t) => !t.departmentId)))
        }

        // Everything once: each run (checklist totals), ticket and delegation counted a single time.
        const total = rowFor(ctx, "total", onlyDepartment ? deptName.get(onlyDepartment) ?? "Your department" : "Whole organisation", "", undefined, checklist?.totals, ticketRows, deptTasks)

        const sharedRunsByPerson = new Map((checklist?.people ?? []).map((p) => [p.userId, p.sharedRuns]))
        const sharedRunsByDepartment = new Map((checklist?.departments ?? []).map((d) => [d.departmentId ?? NO_DEPARTMENT_ROW_ID, d.sharedRuns]))

        return {
            departments: depts.filter(hasData).sort((a, b) => (a.id === NO_DEPARTMENT_ROW_ID ? 1 : 0) - (b.id === NO_DEPARTMENT_ROW_ID ? 1 : 0) || a.name.localeCompare(b.name)),
            people,
            total,
            unassigned,
            sharedRunsByPerson,
            sharedRunsByDepartment,
            checklistSharing: checklist?.sharing ?? { runsWithSeveralAssignees: 0, runsAcrossDepartments: 0, runsWithoutAssignee: 0 },
            definitions: checklist?.definitions,
            onlyDepartment,
        }
    },

    /**
     * Every store with work in the window, scored with the store card's rules (checklist runs of the store,
     * tickets of the store, delegations following the store of their department), in one grouped pass: one
     * checklist build split by store, one ticket and one delegation query, grouped in memory.
     *
     * Nothing is dropped, so the stores add up to the whole organisation: a switched-off store that still has
     * work keeps its row (`inactive: true`, "(inactive)" in the name), and tickets with no store and
     * delegations whose department has no store (or that have no department) sit on the `no-store` row.
     * Checklist runs always belong to a store. `filter.recurrence` narrows the checklist part only.
     */
    async storeRows(viewer: AccessTokenPayload, from: string, to: string, filter: { recurrence?: string } = {}): Promise<ScoreReportRow[]> {
        const win = windowOf(from, to)
        const now = new Date()
        const ctx: FoldContext = { now, win }
        const [all, checklist, taskRows, ticketRows] = await Promise.all([
            db.select({ id: stores.id, name: stores.name, isActive: stores.isActive }).from(stores),
            checklistReportService.build(viewer, { from, to, groupBy: "person", recurrence: filter.recurrence }, undefined, { byStore: true }).catch((err: unknown) => {
                console.error("scores: store checklist report failed", err)
                return null
            }),
            db
                .select({ ...taskCols, storeId: departments.storeId })
                .from(tasks)
                .leftJoin(departments, eq(departments.id, tasks.departmentId))
                .where(and(DELEGATION_ONLY, gte(tasks.dueDate, win.start), lt(tasks.dueDate, win.end))),
            db
                .select({ ...ticketCols, storeId: tickets.storeId })
                .from(tickets)
                .where(and(isNull(tickets.deletedAt), isNull(tickets.declinedAt), gte(tickets.tatDueAt, win.start), lt(tickets.tatDueAt, win.end))),
        ])

        const checklistByStore = new Map((checklist?.storeTotals ?? []).map((s) => [s.storeId, s]))
        const reportTasks = taskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) }))
        const tasksByStore = groupRows(reportTasks, (t) => t.storeId)
        const ticketsByStore = groupRows(ticketRows, (t) => t.storeId)

        const rows = all
            .map((s) => ({
                ...rowFor(ctx, s.id, s.isActive ? s.name : `${s.name} (inactive)`, "", undefined, checklistByStore.get(s.id), ticketsByStore.get(s.id) ?? [], tasksByStore.get(s.id) ?? []),
                ...(s.isActive ? {} : { inactive: true }),
            }))
            .filter(hasData)
            .sort((a, b) => a.name.localeCompare(b.name))
        const noStore = rowFor(ctx, NO_STORE_ROW_ID, "Other / no store", "", undefined, null, ticketRows.filter((t) => !t.storeId), reportTasks.filter((t) => !t.storeId))
        return hasData(noStore) ? [...rows, noStore] : rows
    },
}
