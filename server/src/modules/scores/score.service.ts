import { and, eq, gte, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm"
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

export type { ChecklistScore, DelegationScore, ModuleBlocks, TicketScore }

const DAY_MS = 86_400_000

export type ScoreScope = "person" | "department" | "store" | "org"

export type Scores = ModuleBlocks & {
    scope: ScoreScope
    id: string
    name: string
    from: string
    to: string
    overall: number | null
    totalDue: number
    rankable: boolean
}

export type TrendPeriod = "day" | "week" | "month" | "quarter" | "year"
export type TrendBucket = ModuleBlocks & { label: string; from: string; to: string; overall: number | null }
export type ScoreTrend = { scope: ScoreScope; id: string; name: string; period: TrendPeriod; buckets: TrendBucket[] }

export type ScoreReportRow = ModuleBlocks & {
    id: string
    name: string
    department: string
    departmentId?: string | null
    role?: string
    left?: boolean
    inactive?: boolean
    overall: number | null
    totalDue: number
    rankable: boolean
}

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
    total?: ScoreReportRow
    notes: string[]
}

export { SCORE_REPORT_NOTES }

type Finished = { submittedAt: Date | null; verifiedAt: Date | null; updatedAt: Date }

const finishedAt = (t: Finished) => t.submittedAt ?? t.verifiedAt ?? t.updatedAt

const DELEGATION_ONLY = and(isNull(tasks.deletedAt), eq(tasks.category, "delegation"), isNull(tasks.parentTaskId), eq(tasks.awaitingHeadApproval, false), isNull(tasks.declinedAt))

const taskCols = { status: tasks.status, dueDate: tasks.dueDate, submittedAt: tasks.submittedAt, verifiedAt: tasks.verifiedAt, updatedAt: tasks.updatedAt }
const ticketCols = { status: tickets.status, tatDueAt: tickets.tatDueAt, closedAt: tickets.closedAt, submittedAt: tickets.submittedAt, reopenCount: tickets.reopenCount }

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

export const windowOf = (from: string, to: string): ScoreWindow => {
    const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
    return { start: new Date(Date.parse(`${from}T00:00:00.000Z`) - offsetMs), end: new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS - offsetMs) }
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const bucketsFor = (period: TrendPeriod, from: string, to: string): { label: string; from: string; to: string }[] => {
    const fromMs = Date.parse(`${from}T00:00:00.000Z`)
    const toMs = Date.parse(`${to}T00:00:00.000Z`)
    const out: { label: string; from: string; to: string }[] = []
    if (period === "day" || period === "week") {
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

type Target = { name: string; taskWhere: SQL | undefined; ticketWhere: SQL | undefined; checklistFor: (viewer: AccessTokenPayload, from: string, to: string) => Promise<ReportMetrics | null> }

const personMetrics = (viewer: AccessTokenPayload, from: string, to: string, userId: string) =>
    checklistReportService.build(viewer, { from, to, groupBy: "person" }, userId).then((r) => r.people.find((p) => p.userId === userId) ?? null)
const totalsMetrics = (viewer: AccessTokenPayload, from: string, to: string, storeId?: string) =>
    checklistReportService.build(viewer, { from, to, groupBy: "department", storeId }).then((r) => r.totals)
const departmentMetrics = (viewer: AccessTokenPayload, from: string, to: string, departmentId: string) =>
    checklistReportService.build(viewer.role === "MANAGER" || viewer.role === "SENIOR" ? { ...viewer, role: "PC" } : viewer, { from, to, groupBy: "department", departmentId }).then((r) => r.departments.find((d) => d.departmentId === departmentId) ?? null)

export type OrgCounts = {
    stores: { active: number; inactive: number }
    departments: { active: number; inactive: number }
    employees: { active: number; joinedLast30Days: number }
    departmentsWithLead: number
}

export type ScoreFilter = { storeId?: string; departmentId?: string; recurrence?: string }

export type ScoreCollection = {
    departments: ScoreReportRow[]
    people: ScoreReportRow[]
    total: ScoreReportRow
    unassigned: ScoreReportRow
    sharedRunsByPerson: Map<string, number>
    sharedRunsByDepartment: Map<string, number>
    checklistSharing: { runsWithSeveralAssignees: number; runsAcrossDepartments: number; runsWithoutAssignee: number }
    definitions?: DefinitionRow[]
    onlyDepartment?: string
}

export const scoreService = {
    async orgCounts(viewer: AccessTokenPayload): Promise<OrgCounts> {
        if (viewer.role !== "ADMIN" && viewer.role !== "PC") throw AppError.forbidden()
        const joinedSince = new Date(Date.now() - 30 * DAY_MS)
        const [[storeRow], [deptRow], [userRow], [leadRow]] = await Promise.all([
            db.select({ total: sql<number>`COUNT(*)`, active: sql<number>`COALESCE(SUM(${stores.isActive}), 0)` }).from(stores),
            db.select({ total: sql<number>`COUNT(*)`, active: sql<number>`COALESCE(SUM(${departments.isActive}), 0)` }).from(departments),
            db
                .select({ active: sql<number>`COALESCE(SUM(${users.isActive}), 0)`, joined: sql<number>`COALESCE(SUM(CASE WHEN ${users.isActive} = 1 AND ${users.createdAt} >= ${joinedSince} THEN 1 ELSE 0 END), 0)` })
                .from(users)
                .where(ne(users.role, "OWNER")),
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
            if (!orgWide && !hod) throw AppError.forbidden()
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
            taskWhere: inArray(tasks.departmentId, db.select({ id: departments.id }).from(departments).where(eq(departments.storeId, id))),
            ticketWhere: eq(tickets.storeId, id),
            checklistFor: (v, from, to) => totalsMetrics(v, from, to, id),
        }
    },

    async forScope(viewer: AccessTokenPayload, scope: ScoreScope, id: string, from: string, to: string, resolved?: Target): Promise<Scores> {
        const target = resolved ?? (await this.resolve(viewer, scope, id))
        const win = windowOf(from, to)
        const now = new Date()

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
                .where(and(isNull(tickets.deletedAt), isNull(tickets.declinedAt), eq(tickets.awaitingHeadApproval, false), gte(tickets.tatDueAt, win.start), lt(tickets.tatDueAt, win.end), target.ticketWhere)),
        ])

        const blocks = blocksFor({ now, win }, checklistMetrics, ticketRows, taskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) })))
        return { scope, id, name: target.name, from, to, ...blocks, ...rankFields(blocks) }
    },

    async trend(viewer: AccessTokenPayload, scope: ScoreScope, id: string, period: TrendPeriod, from: string, to: string): Promise<ScoreTrend> {
        const target = await this.resolve(viewer, scope, id)
        const buckets = bucketsFor(period, from, to)
        const out: TrendBucket[] = []
        for (let i = 0; i < buckets.length; i += 4) {
            const slice = buckets.slice(i, i + 4)
            const scored = await Promise.all(slice.map((b) => this.forScope(viewer, scope, id, b.from, b.to, target)))
            scored.forEach((s, k) => out.push({ label: slice[k].label, from: slice[k].from, to: slice[k].to, checklist: s.checklist, ticket: s.ticket, delegation: s.delegation, overall: s.overall }))
        }
        return { scope, id, name: target.name, period, buckets: out }
    },

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

    async collect(viewer: AccessTokenPayload, from: string, to: string, orgWide: boolean, filter: ScoreFilter = {}, want: { definitions?: boolean } = {}): Promise<ScoreCollection> {
        const onlyDepartment = orgWide ? filter.departmentId : viewer.departmentId ?? NO_DEPARTMENT_ROW_ID
        const win = windowOf(from, to)
        const now = new Date()
        const ctx: FoldContext = { now, win }
        const storeTaskFilter = filter.storeId ? inArray(tasks.departmentId, db.select({ id: departments.id }).from(departments).where(eq(departments.storeId, filter.storeId))) : undefined
        const storeTicketFilter = filter.storeId ? eq(tickets.storeId, filter.storeId) : undefined
        const taskWhere = and(DELEGATION_ONLY, gte(tasks.dueDate, win.start), lt(tasks.dueDate, win.end), onlyDepartment ? eq(tasks.departmentId, onlyDepartment) : undefined, storeTaskFilter)
        const ticketWhere = and(isNull(tickets.deletedAt), isNull(tickets.declinedAt), eq(tickets.awaitingHeadApproval, false), gte(tickets.tatDueAt, win.start), lt(tickets.tatDueAt, win.end), onlyDepartment ? eq(tickets.departmentId, onlyDepartment) : undefined, storeTicketFilter)

        const userCols = { id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, departmentId: users.departmentId, isActive: users.isActive }
        const [checklist, userRows, deptRows, taskRows, extraAssigneeRows, ticketRows] = await Promise.all([
            checklistReportService.build(viewer, { from, to, groupBy: "both", storeId: filter.storeId, departmentId: onlyDepartment, recurrence: filter.recurrence }, undefined, { byDefinition: want.definitions === true }).catch((err: unknown) => {
                console.error("scores: checklist report failed", err)
                return null
            }),
            db
                .select(userCols)
                .from(users)
                .where(and(ne(users.role, "OWNER"), onlyDepartment ? eq(users.departmentId, onlyDepartment) : eq(users.isActive, true))),
            db.select({ id: departments.id, name: departments.name }).from(departments).where(onlyDepartment ? eq(departments.id, onlyDepartment) : undefined),
            db
                .select({ id: tasks.id, ...taskCols, assigneeId: tasks.assigneeId, departmentId: tasks.departmentId })
                .from(tasks)
                .where(taskWhere),
            db
                .select({ taskId: taskAdditionalAssignees.taskId, userId: taskAdditionalAssignees.userId })
                .from(taskAdditionalAssignees)
                .innerJoin(tasks, eq(tasks.id, taskAdditionalAssignees.taskId))
                .where(taskWhere),
            db
                .select({ ...ticketCols, assigneeId: tickets.assigneeId, departmentId: tickets.departmentId })
                .from(tickets)
                .where(ticketWhere),
        ])

        const peopleRows = userRows.filter((u) => u.isActive)

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
                        .where(and(isNull(tickets.deletedAt), isNull(tickets.declinedAt), eq(tickets.awaitingHeadApproval, false), gte(tickets.tatDueAt, win.start), lt(tickets.tatDueAt, win.end), storeTicketFilter, inArray(tickets.assigneeId, ids))),
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
        const checklistByDept = new Map((checklist?.departments ?? []).map((d) => [d.departmentId, d]))

        const deptTasks = taskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) }))
        const personTasks = personTaskRows === taskRows ? deptTasks : personTaskRows.map((t) => ({ ...t, finishedAt: finishedAt(t) }))
        const personTaskById = new Map(personTasks.map((t) => [t.id, t]))
        const tasksByPerson = groupRows(personTasks, (t) => t.assigneeId)
        for (const extra of personExtraRows) {
            const task = personTaskById.get(extra.taskId)
            if (!task || task.assigneeId === extra.userId) continue
            const list = tasksByPerson.get(extra.userId)
            if (list) list.push(task)
            else tasksByPerson.set(extra.userId, [task])
        }
        const ticketsByPerson = groupRows(personTicketRows, (t) => t.assigneeId)
        const tasksByDept = groupRows(deptTasks, (t) => t.departmentId)
        const ticketsByDept = groupRows(ticketRows, (t) => t.departmentId)

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
        if (!onlyDepartment) {
            const c = checklistByDept.get(null)
            depts.push(rowFor(ctx, NO_DEPARTMENT_ROW_ID, "No department", "No department", undefined, c, ticketRows.filter((t) => !t.departmentId), deptTasks.filter((t) => !t.departmentId)))
        }

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
                .where(and(isNull(tickets.deletedAt), isNull(tickets.declinedAt), eq(tickets.awaitingHeadApproval, false), gte(tickets.tatDueAt, win.start), lt(tickets.tatDueAt, win.end))),
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
