import { and, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import {
    checklistInstanceAssignees,
    checklistInstanceItems,
    checklistInstances,
    departments,
    notifications,
    stores,
    taskAdditionalAssignees,
    tasks,
    tickets,
    users,
} from "../../db/schema/index.js"
import { closedFromPastDayExpr, localNowSql, missedFromPastDayExpr, runClosingSql, runDeadlineSql } from "../checklistInstances/checklistMissedRun.js"
import { isHod, parentNotDeletedExpr } from "../checklistInstances/checklistInstance.service.js"
import { notificationService } from "../notifications/notification.service.js"
import { scoreService } from "../scores/score.service.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { isAdminOrPc } from "../../utils/roles.js"

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const CLOSING_SOON_MS = 60 * MINUTE_MS
const REMIND_COOLDOWN_MS = 30 * MINUTE_MS
const STREAK_LOOKBACK_DAYS = 14
const PEOPLE_LIMIT = 300
const DETAIL_LIST_LIMIT = 8
export const REMINDER_TYPE = "CHECKLIST_REMINDER_NUDGE"

export type RunState = "submitted" | "missed" | "not_started" | "in_progress" | "to_submit" | "sent_back" | "upcoming"
export type DayState = "done" | "partial" | "missed" | "open" | "none"
export type AttentionLevel = "red" | "orange"

export type TodayRun = {
    id: string
    userId: string
    title: string
    storeName: string | null
    state: RunState
    deadline: string
    opensTime: string | null
    cutoffTime: string | null
    doneItems: number
    totalItems: number
    closingSoon: boolean
}

export type PersonAttention = {
    userId: string
    name: string
    avatarUrl: string | null
    role: string
    departmentName: string | null
    storeName: string | null
    level: AttentionLevel
    dueToday: number
    submittedRuns: number
    missedRuns: number
    notStartedRuns: number
    inProgressRuns: number
    toSubmitRuns: number
    sentBackRuns: number
    closingSoon: number
    overdueTickets: number
    openTickets: number
    overdueDelegations: number
    openDelegations: number
    missedStreak: number
    lastRemindedAt: string | null
}

export type DayCell = { date: string; state: DayState; total: number; missed: number; done: number }

type Scope = { orgWide: true; departmentId?: string; storeId?: string } | { orgWide: false; departmentId: string }

const offsetMs = () => env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * MINUTE_MS
const orgDay = (ms: number) => new Date(ms + offsetMs()).toISOString().slice(0, 10)
const localToUtcMs = (local: string) => Date.parse(`${local}Z`) - offsetMs()
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10)
const fullName = (u: { firstName: string; lastName: string | null }) => `${u.firstName} ${u.lastName ?? ""}`.trim()

const scopeOf = (viewer: AccessTokenPayload, filter: { departmentId?: string; storeId?: string } = {}): Scope | null => {
    if (isAdminOrPc(viewer.role)) return { orgWide: true, departmentId: filter.departmentId, storeId: filter.storeId }
    if (isHod(viewer) && viewer.departmentId) return { orgWide: false, departmentId: viewer.departmentId }
    return null
}

const userScope = (scope: Scope): SQL | undefined =>
    and(
        eq(users.isActive, true),
        ne(users.role, "OWNER"),
        scope.departmentId ? eq(users.departmentId, scope.departmentId) : undefined,
        scope.orgWide && scope.storeId ? eq(users.storeId, scope.storeId) : undefined,
    )

const dayStartSql = sql`TIMESTAMP(DATE(${localNowSql}))`
const deadlineTodaySql = sql`(${runDeadlineSql} > ${dayStartSql} AND ${runDeadlineSql} <= DATE_ADD(${dayStartSql}, INTERVAL 1 DAY))`
const openedSql = sql`(DATE(${checklistInstances.periodStart}) < DATE(${localNowSql}) OR ${checklistInstances.opensTime} IS NULL OR ${checklistInstances.opensTime} <= TIME_FORMAT(${localNowSql}, '%H:%i'))`
const totalItemsSql = sql<number>`(SELECT COUNT(*) FROM ${checklistInstanceItems} ti WHERE ti.instanceId = ${checklistInstances.id})`
const doneItemsSql = sql<number>`(SELECT COALESCE(SUM(ti.isDone), 0) FROM ${checklistInstanceItems} ti WHERE ti.instanceId = ${checklistInstances.id})`

const classify = (r: { submittedAt: Date | null; verificationStatus: string; missed: number; opened: number; deadlineMs: number; doneItems: number; totalItems: number }, now: number): RunState => {
    if (r.verificationStatus === "REJECTED") return "sent_back"
    if (r.submittedAt || r.verificationStatus === "PENDING_APPROVAL" || r.verificationStatus === "APPROVED") return "submitted"
    if (Number(r.missed) > 0) return "missed"
    if (r.totalItems > 0 && r.doneItems >= r.totalItems) return "to_submit"
    if (!Number(r.opened)) return "upcoming"
    if (r.deadlineMs <= now) return "missed"
    return r.doneItems > 0 ? "in_progress" : "not_started"
}

const loadTodayRuns = async (where: SQL | undefined, now: number): Promise<TodayRun[]> => {
    const rows = await db
        .select({
            id: checklistInstances.id,
            userId: checklistInstanceAssignees.userId,
            title: checklistInstances.title,
            storeName: stores.name,
            submittedAt: checklistInstances.submittedAt,
            verificationStatus: checklistInstances.verificationStatus,
            opensTime: checklistInstances.opensTime,
            cutoffTime: checklistInstances.cutoffTime,
            deadline: sql<string>`DATE_FORMAT(${runClosingSql}, '%Y-%m-%dT%H:%i:%s')`,
            missed: sql<number>`CASE WHEN ${closedFromPastDayExpr} THEN 1 ELSE 0 END`,
            opened: sql<number>`CASE WHEN ${openedSql} THEN 1 ELSE 0 END`,
            totalItems: totalItemsSql,
            doneItems: doneItemsSql,
        })
        .from(checklistInstanceAssignees)
        .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
        .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
        .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
        .where(and(deadlineTodaySql, sql`${checklistInstances.periodStart} >= DATE_SUB(DATE(${localNowSql}), INTERVAL 400 DAY)`, sql`DATE(${checklistInstances.periodStart}) <= DATE(${localNowSql})`, parentNotDeletedExpr, where))

    return rows.map((r) => {
        const deadlineMs = localToUtcMs(r.deadline)
        const doneItems = Number(r.doneItems)
        const totalItems = Number(r.totalItems)
        const state = classify({ ...r, deadlineMs, doneItems, totalItems }, now)
        return {
            id: r.id,
            userId: r.userId,
            title: r.title,
            storeName: r.storeName,
            state,
            deadline: new Date(deadlineMs).toISOString(),
            opensTime: r.opensTime,
            cutoffTime: r.cutoffTime,
            doneItems,
            totalItems,
            closingSoon: (state === "not_started" || state === "in_progress") && deadlineMs - now <= CLOSING_SOON_MS,
        }
    })
}

const loadDailyFill = async (where: SQL | undefined, from: string, to: string, today: string): Promise<Map<string, Map<string, { total: number; missed: number; done: number }>>> => {
    const dueDay = sql<string>`DATE_FORMAT(DATE_SUB(${runDeadlineSql}, INTERVAL 1 SECOND), '%Y-%m-%d')`
    const rows = await db
        .select({
            userId: checklistInstanceAssignees.userId,
            day: dueDay,
            total: sql<number>`COUNT(*)`,
            missed: sql<number>`COALESCE(SUM(CASE WHEN ${missedFromPastDayExpr} THEN 1 ELSE 0 END), 0)`,
            done: sql<number>`COALESCE(SUM(CASE WHEN ${checklistInstances.submittedAt} IS NOT NULL OR ${checklistInstances.verificationStatus} IN ('PENDING_APPROVAL', 'APPROVED') THEN 1 ELSE 0 END), 0)`,
        })
        .from(checklistInstanceAssignees)
        .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
        .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
        .where(and(
            sql`${checklistInstances.periodStart} >= DATE_SUB(TIMESTAMP(${from}), INTERVAL 400 DAY)`,
            sql`${runDeadlineSql} > TIMESTAMP(${from})`,
            sql`${runDeadlineSql} <= TIMESTAMP(DATE_ADD(${to}, INTERVAL 1 DAY))`,
            sql`${checklistInstances.recurrence} <> 'ONE_TIME'`,
            parentNotDeletedExpr,
            where,
        ))
        .groupBy(checklistInstanceAssignees.userId, dueDay)

    const out = new Map<string, Map<string, { total: number; missed: number; done: number }>>()
    for (const r of rows) {
        if (r.day > today) continue
        let byDay = out.get(r.userId)
        if (!byDay) out.set(r.userId, (byDay = new Map()))
        byDay.set(r.day, { total: Number(r.total), missed: Number(r.missed), done: Number(r.done) })
    }
    return out
}

const cellOf = (date: string, today: string, c: { total: number; missed: number; done: number } | undefined): DayCell => {
    if (!c || c.total === 0) return { date, state: "none", total: 0, missed: 0, done: 0 }
    const finished = date < today ? c.total - c.missed : c.done
    const state: DayState =
        c.missed === 0 ? (date < today || c.done >= c.total ? "done" : "open")
        : c.missed >= c.total ? "missed"
        : "partial"
    return { date, state, total: c.total, missed: c.missed, done: finished }
}

const streakOf = (byDay: Map<string, { total: number; missed: number }> | undefined, today: string) => {
    if (!byDay) return 0
    let streak = 0
    for (let i = 1; i <= STREAK_LOOKBACK_DAYS; i++) {
        const c = byDay.get(addDays(today, -i))
        if (!c || c.total === 0) continue
        if (c.missed > 0) streak += 1
        else break
    }
    return streak
}

const ticketOpenStatuses = ["OPEN", "IN_PROGRESS", "ON_HOLD"] as const
const openDelegationSql = and(isNull(tasks.deletedAt), eq(tasks.category, "delegation"), eq(tasks.awaitingHeadApproval, false), isNull(tasks.declinedAt), sql`${tasks.status} NOT IN ('done', 'draft', 'pending_approval')`)

const lastReminders = async (ids: string[], sinceMs: number) => {
    if (!ids.length) return new Map<string, Date>()
    const rows = await db
        .select({ recipientId: notifications.recipientId, at: sql<Date>`MAX(${notifications.createdAt})`.mapWith(notifications.createdAt) })
        .from(notifications)
        .where(and(inArray(notifications.recipientId, ids), eq(notifications.type, REMINDER_TYPE), gte(notifications.createdAt, new Date(sinceMs))))
        .groupBy(notifications.recipientId)
    return new Map(rows.map((r) => [r.recipientId, r.at]))
}

const reasonLine = (p: PersonAttention) =>
    [
        p.missedRuns > 0 && `${p.missedRuns} checklist${p.missedRuns === 1 ? "" : "s"} not filled`,
        p.notStartedRuns > 0 && `${p.notStartedRuns} checklist${p.notStartedRuns === 1 ? "" : "s"} not started`,
        p.toSubmitRuns > 0 && `${p.toSubmitRuns} waiting for you to submit`,
        p.sentBackRuns > 0 && `${p.sentBackRuns} sent back to fix`,
        p.overdueTickets > 0 && `${p.overdueTickets} ticket${p.overdueTickets === 1 ? "" : "s"} overdue`,
        p.overdueDelegations > 0 && `${p.overdueDelegations} delegation${p.overdueDelegations === 1 ? "" : "s"} overdue`,
    ].filter(Boolean).join(", ")

export const attentionService = {
    async people(viewer: AccessTokenPayload, filter: { departmentId?: string; storeId?: string } = {}): Promise<PersonAttention[]> {
        const scope = scopeOf(viewer, filter)
        if (!scope) return []
        const now = Date.now()
        const today = orgDay(now)
        const where = userScope(scope)

        const [runs, fill, ticketRows, primary, additional] = await Promise.all([
            loadTodayRuns(where, now),
            loadDailyFill(where, addDays(today, -STREAK_LOOKBACK_DAYS), addDays(today, -1), today),
            db
                .select({ userId: tickets.assigneeId, open: sql<number>`COUNT(*)`, overdue: sql<number>`COALESCE(SUM(${tickets.isOverdue} = 1 AND ${tickets.status} IN ('OPEN', 'IN_PROGRESS')), 0)` })
                .from(tickets)
                .innerJoin(users, eq(users.id, tickets.assigneeId))
                .where(and(isNull(tickets.deletedAt), isNull(tickets.declinedAt), inArray(tickets.status, [...ticketOpenStatuses]), where))
                .groupBy(tickets.assigneeId),
            db
                .select({ userId: tasks.assigneeId, open: sql<number>`COUNT(*)`, overdue: sql<number>`COALESCE(SUM(${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${new Date(now)}), 0)` })
                .from(tasks)
                .innerJoin(users, eq(users.id, tasks.assigneeId))
                .where(and(openDelegationSql, where))
                .groupBy(tasks.assigneeId),
            db
                .select({ userId: taskAdditionalAssignees.userId, open: sql<number>`COUNT(*)`, overdue: sql<number>`COALESCE(SUM(${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${new Date(now)}), 0)` })
                .from(taskAdditionalAssignees)
                .innerJoin(tasks, eq(tasks.id, taskAdditionalAssignees.taskId))
                .innerJoin(users, eq(users.id, taskAdditionalAssignees.userId))
                .where(and(openDelegationSql, sql`(${tasks.assigneeId} IS NULL OR ${tasks.assigneeId} <> ${taskAdditionalAssignees.userId})`, where))
                .groupBy(taskAdditionalAssignees.userId),
        ])

        type Tally = Omit<PersonAttention, "userId" | "name" | "avatarUrl" | "role" | "departmentName" | "storeName" | "level" | "missedStreak" | "lastRemindedAt">
        const tally = new Map<string, Tally>()
        const slot = (id: string) => {
            let t = tally.get(id)
            if (!t) tally.set(id, (t = { dueToday: 0, submittedRuns: 0, missedRuns: 0, notStartedRuns: 0, inProgressRuns: 0, toSubmitRuns: 0, sentBackRuns: 0, closingSoon: 0, overdueTickets: 0, openTickets: 0, overdueDelegations: 0, openDelegations: 0 }))
            return t
        }
        for (const r of runs) {
            const t = slot(r.userId)
            if (r.state === "upcoming") continue
            t.dueToday += 1
            if (r.state === "submitted") t.submittedRuns += 1
            else if (r.state === "missed") t.missedRuns += 1
            else if (r.state === "not_started") t.notStartedRuns += 1
            else if (r.state === "in_progress") t.inProgressRuns += 1
            else if (r.state === "to_submit") t.toSubmitRuns += 1
            else if (r.state === "sent_back") t.sentBackRuns += 1
            if (r.closingSoon) t.closingSoon += 1
        }
        for (const r of ticketRows) {
            if (!r.userId) continue
            const t = slot(r.userId)
            t.openTickets += Number(r.open)
            t.overdueTickets += Number(r.overdue)
        }
        for (const r of [...primary, ...additional]) {
            if (!r.userId) continue
            const t = slot(r.userId)
            t.openDelegations += Number(r.open)
            t.overdueDelegations += Number(r.overdue)
        }

        const flagged = [...tally.entries()].filter(([, t]) =>
            t.missedRuns + t.notStartedRuns + t.toSubmitRuns + t.sentBackRuns + t.closingSoon + t.overdueTickets + t.overdueDelegations > 0)
        if (!flagged.length) return []

        const ids = flagged.map(([id]) => id)
        const [info, reminded] = await Promise.all([
            db
                .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, avatarUrl: users.avatarUrl, role: users.role, departmentName: departments.name, storeName: stores.name })
                .from(users)
                .leftJoin(departments, eq(departments.id, users.departmentId))
                .leftJoin(stores, eq(stores.id, users.storeId))
                .where(inArray(users.id, ids)),
            lastReminders(ids, new Date(`${today}T00:00:00.000Z`).getTime() - offsetMs()),
        ])
        const infoOf = new Map(info.map((u) => [u.id, u]))

        const severity = (p: PersonAttention) => p.missedRuns * 3 + p.overdueTickets * 2 + p.overdueDelegations * 2 + p.closingSoon * 2 + p.notStartedRuns + p.sentBackRuns + p.toSubmitRuns
        return flagged
            .filter(([id]) => infoOf.has(id))
            .map(([id, t]): PersonAttention => {
                const u = infoOf.get(id)!
                const red = t.missedRuns > 0 || t.overdueTickets > 0 || t.overdueDelegations > 0 || t.closingSoon > 0
                return {
                    userId: id,
                    name: fullName(u),
                    avatarUrl: u.avatarUrl,
                    role: u.role,
                    departmentName: u.departmentName,
                    storeName: u.storeName,
                    level: red ? "red" : "orange",
                    ...t,
                    missedStreak: streakOf(fill.get(id), today),
                    lastRemindedAt: reminded.get(id)?.toISOString() ?? null,
                }
            })
            .sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1) || severity(b) - severity(a) || a.name.localeCompare(b.name))
            .slice(0, PEOPLE_LIMIT)
    },

    async person(viewer: AccessTokenPayload, userId: string) {
        if (!scopeOf(viewer)) throw AppError.forbidden()
        await scoreService.resolve(viewer, "person", userId)
        const now = Date.now()
        const today = orgDay(now)
        const weekFrom = addDays(today, -6)
        const self = eq(users.id, userId)

        const [[u], runs, fill, ticketRows, delegationRows, reminded] = await Promise.all([
            db
                .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, avatarUrl: users.avatarUrl, role: users.role, phone: users.phone, isActive: users.isActive, departmentName: departments.name, storeName: stores.name })
                .from(users)
                .leftJoin(departments, eq(departments.id, users.departmentId))
                .leftJoin(stores, eq(stores.id, users.storeId))
                .where(self)
                .limit(1),
            loadTodayRuns(self, now),
            loadDailyFill(self, addDays(today, -STREAK_LOOKBACK_DAYS), today, today),
            db
                .select({ id: tickets.id, title: tickets.title, status: tickets.status, priority: tickets.priority, tatDueAt: tickets.tatDueAt, isOverdue: tickets.isOverdue })
                .from(tickets)
                .where(and(eq(tickets.assigneeId, userId), isNull(tickets.deletedAt), isNull(tickets.declinedAt), inArray(tickets.status, [...ticketOpenStatuses])))
                .orderBy(desc(tickets.isOverdue), tickets.tatDueAt)
                .limit(DETAIL_LIST_LIMIT),
            db
                .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate })
                .from(tasks)
                .where(and(openDelegationSql, or(eq(tasks.assigneeId, userId), inArray(tasks.id, db.select({ id: taskAdditionalAssignees.taskId }).from(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.userId, userId))))))
                .orderBy(sql`${tasks.dueDate} IS NULL`, tasks.dueDate)
                .limit(DETAIL_LIST_LIMIT),
            lastReminders([userId], now - DAY_MS),
        ])
        if (!u) throw AppError.notFound("Person not found")

        const byDay = fill.get(userId)
        const week: DayCell[] = []
        for (let d = weekFrom; d <= today; d = addDays(d, 1)) week.push(cellOf(d, today, byDay?.get(d)))
        const order: RunState[] = ["missed", "sent_back", "not_started", "in_progress", "to_submit", "upcoming", "submitted"]

        return {
            userId: u.id,
            name: fullName(u),
            avatarUrl: u.avatarUrl,
            role: u.role,
            phone: u.phone,
            isActive: u.isActive,
            departmentName: u.departmentName,
            storeName: u.storeName,
            runs: runs.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.deadline.localeCompare(b.deadline)),
            tickets: ticketRows.map((t) => ({ ...t, tatDueAt: t.tatDueAt?.toISOString() ?? null })),
            delegations: delegationRows.map((t) => ({ ...t, dueDate: t.dueDate?.toISOString() ?? null, overdue: !!t.dueDate && t.dueDate.getTime() < now })),
            week,
            missedStreak: streakOf(byDay, today),
            lastRemindedAt: reminded.get(userId)?.toISOString() ?? null,
            generatedAt: new Date(now).toISOString(),
        }
    },

    async heatmap(viewer: AccessTokenPayload, from: string, to: string, filter: { departmentId?: string; storeId?: string } = {}) {
        const scope = scopeOf(viewer, filter)
        if (!scope) throw AppError.forbidden()
        const today = orgDay(Date.now())
        const end = to > today ? today : to
        const where = userScope(scope)
        const [people, fill] = await Promise.all([
            db
                .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, avatarUrl: users.avatarUrl, departmentName: departments.name })
                .from(users)
                .leftJoin(departments, eq(departments.id, users.departmentId))
                .where(where),
            loadDailyFill(where, from, end, today),
        ])
        const days: string[] = []
        for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
        const rows = people
            .filter((p) => fill.has(p.id))
            .map((p) => {
                const byDay = fill.get(p.id)
                const cells = days.map((d) => (d > today ? { date: d, state: "none" as DayState, total: 0, missed: 0, done: 0 } : cellOf(d, today, byDay?.get(d))))
                const due = cells.reduce((n, c) => n + (c.state === "open" ? 0 : c.total), 0)
                const missed = cells.reduce((n, c) => n + c.missed, 0)
                return {
                    userId: p.id,
                    name: fullName(p),
                    avatarUrl: p.avatarUrl,
                    departmentName: p.departmentName,
                    cells,
                    due,
                    missed,
                    fillRate: due > 0 ? Math.round(((due - missed) / due) * 100) : null,
                    missedStreak: streakOf(byDay, today),
                }
            })
            .sort((a, b) => (a.fillRate ?? 101) - (b.fillRate ?? 101) || a.name.localeCompare(b.name))
        return { from, to, today, days, people: rows }
    },

    async remind(viewer: AccessTokenPayload, userIds: string[]) {
        const scope = scopeOf(viewer)
        if (!scope) throw AppError.forbidden()
        const wanted = [...new Set(userIds)].filter((id) => id !== viewer.sub)
        if (!wanted.length) return { sent: 0, skipped: 0, notAllowed: 0 }

        const allowedRows = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, wanted), userScope(scope)))
        const allowed = allowedRows.map((r) => r.id)
        const recent = await lastReminders(allowed, Date.now() - REMIND_COOLDOWN_MS)
        const targets = allowed.filter((id) => !recent.has(id))

        const [[me], attention] = await Promise.all([
            db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, viewer.sub)).limit(1),
            targets.length ? this.people(viewer) : Promise.resolve([] as PersonAttention[]),
        ])
        const from = me ? fullName(me) : "Your manager"
        const byPerson = new Map(attention.map((p) => [p.userId, p]))
        const groups = new Map<string, string[]>()
        for (const id of targets) {
            const p = byPerson.get(id)
            const reasons = p ? reasonLine(p) : ""
            const message = reasons
                ? `Still waiting on you today: ${reasons}. Please finish them before they close.`
                : "Please check your checklists and tasks for today and finish anything still open."
            const list = groups.get(message)
            if (list) list.push(id)
            else groups.set(message, [id])
        }
        for (const [message, ids] of groups) {
            await notificationService.notifyMany(ids, { type: REMINDER_TYPE, title: `Reminder from ${from}`, message })
        }
        return { sent: targets.length, skipped: allowed.length - targets.length, notAllowed: wanted.length - allowed.length }
    },
}
