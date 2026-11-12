import { and, asc, count, desc, eq, inArray, isNotNull, lt, notInArray, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstanceAssignees, stores, tasks, tickets, todos, users } from "../../db/schema/index.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { isAdminOrPc, isDepartmentHeadRole } from "../../utils/roles.js"
import { utcSql } from "../checklistInstances/checklistReportRange.js"
import { delegationScopeWhere } from "../tasks/taskReports.js"
import { ticketScopeWhere } from "../tickets/ticketReports.js"
import { runFlagsInWindow } from "../checklistInstances/checklistInstanceQueries.js"
import type { InstanceListFilter } from "../checklistInstances/checklistInstanceShared.js"
import { runMatchesMetric, type WorkKind, type WorkMetric } from "./workMetric.js"

export const WORK_ROW_LIMIT = 50

export type WorkRow = {
    id: string
    kind: WorkKind
    title: string
    subtitle: string | null
    dueAt: string | null
    dueText: string | null
    late: boolean
    href: string
}

export type WorkGroup = { kind: WorkKind; total: number; rows: WorkRow[]; failed?: boolean }

export type WorkQuery = { metric: WorkMetric; scope: "mine" | "visible"; today?: string; kinds: WorkKind[] }

const nameOf = (first: string | null, last: string | null) => (first ? `${first}${last ? ` ${last}` : ""}` : null)

const metricWhere = (open: SQL, late: SQL, metric: WorkMetric): SQL | undefined => {
    if (metric === "total") return undefined
    if (metric === "pending") return open
    return metric === "delayed" ? and(open, late) : and(open, sql`NOT (${late})`)
}

const delegationGroup = async (user: AccessTokenPayload, query: WorkQuery, now: Date): Promise<WorkGroup> => {
    const open = notInArray(tasks.status, ["done", "pending_approval", "draft"])
    const late = and(isNotNull(tasks.dueDate), lt(tasks.dueDate, utcSql(now)))!
    const where = and(await delegationScopeWhere(user, query.scope), metricWhere(open, late, query.metric))
    const [totalRow, rows] = await Promise.all([
        db.select({ n: count() }).from(tasks).where(where),
        db.select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, status: tasks.status, first: users.firstName, last: users.lastName })
            .from(tasks).leftJoin(users, eq(users.id, tasks.assigneeId)).where(where)
            .orderBy(sql`${tasks.dueDate} IS NULL`, asc(tasks.dueDate), desc(tasks.createdAt)).limit(WORK_ROW_LIMIT),
    ])
    return {
        kind: "delegation",
        total: Number(totalRow[0]?.n ?? 0),
        rows: rows.map((r) => {
            const isOpen = !["done", "pending_approval", "draft"].includes(r.status)
            return {
                id: r.id, kind: "delegation", title: r.title, subtitle: nameOf(r.first, r.last),
                dueAt: r.dueDate ? r.dueDate.toISOString() : null, dueText: null,
                late: isOpen && !!r.dueDate && r.dueDate.getTime() < now.getTime(),
                href: `/tasks?open=${r.id}`,
            }
        }),
    }
}

const ticketGroup = async (user: AccessTokenPayload, query: WorkQuery): Promise<WorkGroup> => {
    const open = notInArray(tickets.status, ["CLOSED", "PENDING_APPROVAL"])
    const late = eq(tickets.isOverdue, true)
    const where = and(await ticketScopeWhere(user, query.scope), metricWhere(open, late, query.metric))
    const [totalRow, rows] = await Promise.all([
        db.select({ n: count() }).from(tickets).where(where),
        db.select({ id: tickets.id, title: tickets.title, tatDueAt: tickets.tatDueAt, isOverdue: tickets.isOverdue, status: tickets.status, first: users.firstName, last: users.lastName })
            .from(tickets).leftJoin(users, eq(users.id, tickets.assigneeId)).where(where)
            .orderBy(desc(tickets.isOverdue), sql`${tickets.tatDueAt} IS NULL`, asc(tickets.tatDueAt), desc(tickets.createdAt)).limit(WORK_ROW_LIMIT),
    ])
    return {
        kind: "ticket",
        total: Number(totalRow[0]?.n ?? 0),
        rows: rows.map((r) => ({
            id: r.id, kind: "ticket", title: r.title, subtitle: nameOf(r.first, r.last) ?? "Nobody yet",
            dueAt: r.tatDueAt ? r.tatDueAt.toISOString() : null, dueText: null,
            late: r.isOverdue && r.status !== "CLOSED" && r.status !== "PENDING_APPROVAL",
            href: `/tickets?open=${r.id}`,
        })),
    }
}

const todoGroup = async (user: AccessTokenPayload, query: WorkQuery, now: Date): Promise<WorkGroup> => {
    const open = eq(todos.completed, false)
    const late = and(isNotNull(todos.dueDate), lt(todos.dueDate, utcSql(now)))!
    const where = and(eq(todos.userId, user.sub), metricWhere(open, late, query.metric))
    const [totalRow, rows] = await Promise.all([
        db.select({ n: count() }).from(todos).where(where),
        db.select().from(todos).where(where)
            .orderBy(sql`${todos.dueDate} IS NULL`, asc(todos.dueDate), desc(todos.createdAt)).limit(WORK_ROW_LIMIT),
    ])
    return {
        kind: "todo",
        total: Number(totalRow[0]?.n ?? 0),
        rows: rows.map((r) => ({
            id: r.id, kind: "todo", title: r.text, subtitle: null,
            dueAt: r.dueDate ? r.dueDate.toISOString() : null, dueText: null,
            late: !r.completed && !!r.dueDate && r.dueDate.getTime() < now.getTime(),
            href: "/todo",
        })),
    }
}

const checklistFilter = (user: AccessTokenPayload, query: WorkQuery): InstanceListFilter => {
    const base: InstanceListFilter = { hideEnded: true, includeDeleted: false, from: query.today, to: query.today }
    if (query.scope === "mine") return { ...base, userId: user.sub }
    if (isAdminOrPc(user.role)) return base
    if (isDepartmentHeadRole(user.role) && user.departmentId) return { ...base, departmentId: user.departmentId }
    return { ...base, userId: user.sub }
}

const checklistGroup = async (user: AccessTokenPayload, query: WorkQuery, now: Date): Promise<WorkGroup> => {
    const { runRows, flags } = await runFlagsInWindow(checklistFilter(user, query), now)
    const rowById = new Map(runRows.map((r) => [r.id, r]))
    const matching = flags
        .filter((f) => runMatchesMetric(f, query.metric))
        .sort((a, b) => Number(b.missed) - Number(a.missed) || a.title.localeCompare(b.title))
    const shown = matching.slice(0, WORK_ROW_LIMIT)
    const ids = shown.map((f) => f.id)
    const storeIds = [...new Set(shown.map((f) => f.storeId))]
    const [storeRows, assigneeRows] = await Promise.all([
        storeIds.length ? db.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, storeIds)) : Promise.resolve([]),
        ids.length
            ? db.select({ instanceId: checklistInstanceAssignees.instanceId, first: users.firstName })
                .from(checklistInstanceAssignees).innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
                .where(inArray(checklistInstanceAssignees.instanceId, ids))
            : Promise.resolve([]),
    ])
    const storeName = new Map(storeRows.map((s) => [s.id, s.name]))
    const people = new Map<string, string[]>()
    for (const a of assigneeRows) people.set(a.instanceId, [...(people.get(a.instanceId) ?? []), a.first])
    return {
        kind: "checklist",
        total: matching.length,
        rows: shown.map((f) => {
            const run = rowById.get(f.id)
            const names = people.get(f.id) ?? []
            const who = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ")
            return {
                id: f.id, kind: "checklist", title: f.title,
                subtitle: [storeName.get(f.storeId), who].filter(Boolean).join(" · ") || null,
                dueAt: null, dueText: run?.cutoffTime ? `By ${run.cutoffTime}` : null,
                late: !f.complete && f.missed,
                href: `/checklists/${f.id}`,
            }
        }),
    }
}

const safely = async (kind: WorkKind, load: () => Promise<WorkGroup>): Promise<WorkGroup> => {
    try {
        return await load()
    } catch (err) {
        console.error(`Work items (${kind}) failed:`, err)
        return { kind, total: 0, rows: [], failed: true }
    }
}

export const workItems = async (user: AccessTokenPayload, query: WorkQuery): Promise<{ metric: WorkMetric; scope: "mine" | "visible"; groups: WorkGroup[] }> => {
    const now = new Date()
    const wanted = new Set(query.kinds.filter((k) => k !== "todo" || query.scope === "mine"))
    const loaders: [WorkKind, () => Promise<WorkGroup>][] = [
        ["delegation", () => delegationGroup(user, query, now)],
        ["ticket", () => ticketGroup(user, query)],
        ["checklist", () => checklistGroup(user, query, now)],
        ["todo", () => todoGroup(user, query, now)],
    ]
    const groups = await Promise.all(loaders.filter(([kind]) => wanted.has(kind)).map(([kind, load]) => safely(kind, load)))
    return { metric: query.metric, scope: query.scope, groups }
}

