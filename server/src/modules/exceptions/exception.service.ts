import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstanceAssignees, checklistInstanceItems, checklistInstances, stores, taskAdditionalAssignees, tasks, tickets, users } from "../../db/schema/index.js"
import { visibilityFilter } from "../tickets/ticket.service.js"
import {
    deadlineExpr,
    instanceInDepartmentCondition,
    isHod,
    localNowExpr,
    parentNotDeletedExpr,
} from "../checklistInstances/checklistInstance.service.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"

// An urgent ticket nobody has moved for this long is an exception (one setting for all priorities).
const STALE_TICKET_HOURS = 4
const PER_KIND_LIMIT = 20
const HOUR_MS = 3_600_000

export type ExceptionKind = "TICKET_OVERDUE" | "TICKET_STALE" | "CHECKLIST_MISSED"
export type ExceptionSeverity = "high" | "medium"

export interface ExceptionItem {
    id: string
    kind: ExceptionKind
    severity: ExceptionSeverity
    title: string
    detail: string
    storeName: string | null
    since: string
    link: string
}

const ago = (ms: number) => {
    const hours = Math.floor(ms / HOUR_MS)
    if (hours < 1) return "under an hour"
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
}

export const exceptionService = {
    async list(user: AccessTokenPayload): Promise<ExceptionItem[]> {
        const now = Date.now()
        const items: ExceptionItem[] = []

        // Tickets: only what this person can already see in the ticket list.
        const ticketScope = await visibilityFilter(user)
        const ticketRows = await db
            .select({
                id: tickets.id,
                title: tickets.title,
                priority: tickets.priority,
                status: tickets.status,
                createdAt: tickets.createdAt,
                tatDueAt: tickets.tatDueAt,
                isOverdue: tickets.isOverdue,
                storeName: stores.name,
            })
            .from(tickets)
            .leftJoin(stores, eq(stores.id, tickets.storeId))
            .where(and(
                isNull(tickets.deletedAt),
                inArray(tickets.status, ["OPEN", "IN_PROGRESS"]),
                ticketScope,
                sql`(${tickets.isOverdue} = 1 OR (${tickets.priority} IN ('HIGH','CRITICAL') AND ${tickets.createdAt} <= ${new Date(now - STALE_TICKET_HOURS * HOUR_MS)}))`,
            ))
            .orderBy(tickets.createdAt)
            .limit(PER_KIND_LIMIT)
        for (const t of ticketRows) {
            const urgent = t.priority === "HIGH" || t.priority === "CRITICAL"
            const overdue = t.isOverdue
            items.push({
                id: `ticket:${t.id}`,
                kind: overdue ? "TICKET_OVERDUE" : "TICKET_STALE",
                severity: urgent ? "high" : "medium",
                title: t.title,
                detail: overdue
                    ? `Overdue${t.tatDueAt ? ` by ${ago(now - t.tatDueAt.getTime())}` : ""}, ${t.priority.toLowerCase()} priority`
                    : `${t.priority === "CRITICAL" ? "Critical" : "High"} ticket still ${t.status === "OPEN" ? "open" : "in progress"} after ${ago(now - t.createdAt.getTime())}`,
                storeName: t.storeName,
                since: (overdue && t.tatDueAt ? t.tatDueAt : t.createdAt).toISOString(),
                link: `/tickets`,
            })
        }

        // Checklist runs: org-wide for Admin/PC, own department for HODs (no department = nothing, fail closed).
        const orgWide = user.role === "ADMIN" || user.role === "PC"
        if (orgWide || (isHod(user) && user.departmentId)) {
            const missed = await db
                .select({
                    id: checklistInstances.id,
                    title: checklistInstances.title,
                    storeName: stores.name,
                })
                .from(checklistInstances)
                .innerJoin(stores, eq(stores.id, checklistInstances.storeId))
                .where(and(
                    sql`${checklistInstances.periodStart} >= DATE(${localNowExpr})`,
                    sql`${deadlineExpr} <= ${localNowExpr}`,
                    parentNotDeletedExpr,
                    isNull(checklistInstances.submittedAt),
                    eq(checklistInstances.verificationStatus, "NOT_SUBMITTED"),
                    orgWide ? undefined : instanceInDepartmentCondition(user.departmentId!),
                ))
                .limit(PER_KIND_LIMIT)
            for (const m of missed) {
                items.push({
                    id: `run:${m.id}`,
                    kind: "CHECKLIST_MISSED",
                    severity: "high",
                    title: m.title,
                    detail: "Today's run closed without being submitted",
                    storeName: m.storeName,
                    since: new Date(now).toISOString(),
                    link: `/checklists`,
                })
            }
        }

        // Approvals waiting are not repeated here: the "Needs your approval" card already lists them, oldest first.

        return items.sort((a, b) => (a.severity === b.severity ? a.since.localeCompare(b.since) : a.severity === "high" ? -1 : 1))
    },

    // People who have not touched a run that is still open today, and people with overdue delegations.
    // Admin/PC: everyone active. Manager/Senior: their own department only (no department = nobody).
    async people(user: AccessTokenPayload): Promise<PersonStatus[]> {
        const orgWide = user.role === "ADMIN" || user.role === "PC"
        if (!orgWide && !(isHod(user) && user.departmentId)) return []
        const scope: SQL | undefined = orgWide ? undefined : eq(users.departmentId, user.departmentId!)
        const now = new Date()

        const notStarted = await db
            .select({ userId: checklistInstanceAssignees.userId, n: sql<number>`COUNT(DISTINCT ${checklistInstances.id})` })
            .from(checklistInstanceAssignees)
            .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
            .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
            .where(and(
                eq(users.isActive, true),
                scope,
                sql`${checklistInstances.periodStart} >= DATE(${localNowExpr})`,
                sql`${deadlineExpr} > ${localNowExpr}`,
                sql`(${checklistInstances.opensTime} IS NULL OR ${checklistInstances.opensTime} <= TIME_FORMAT(${localNowExpr}, '%H:%i'))`,
                parentNotDeletedExpr,
                isNull(checklistInstances.submittedAt),
                eq(checklistInstances.verificationStatus, "NOT_SUBMITTED"),
                sql`NOT EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id} AND i.isDone = 1)`,
            ))
            .groupBy(checklistInstanceAssignees.userId)

        // Open delegations: primary assignee, or one of the additional assignees. Drafts and work already
        // sent for approval are not open (same rule as the scores).
        const openWork = and(
            isNull(tasks.deletedAt),
            eq(tasks.category, "delegation"),
            sql`${tasks.status} NOT IN ('done', 'draft', 'pending_approval')`,
        )
        const overdueSql = sql<number>`COALESCE(SUM(${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${now}), 0)`
        const primary = await db
            .select({ userId: tasks.assigneeId, open: sql<number>`COUNT(*)`, overdue: overdueSql })
            .from(tasks)
            .innerJoin(users, eq(users.id, tasks.assigneeId))
            .where(and(openWork, eq(users.isActive, true), scope))
            .groupBy(tasks.assigneeId)
        const additional = await db
            .select({ userId: taskAdditionalAssignees.userId, open: sql<number>`COUNT(*)`, overdue: overdueSql })
            .from(taskAdditionalAssignees)
            .innerJoin(tasks, eq(tasks.id, taskAdditionalAssignees.taskId))
            .innerJoin(users, eq(users.id, taskAdditionalAssignees.userId))
            .where(and(openWork, eq(users.isActive, true), scope))
            .groupBy(taskAdditionalAssignees.userId)

        const byUser = new Map<string, { notStarted: number; open: number; overdue: number }>()
        const slot = (id: string) => {
            let s = byUser.get(id)
            if (!s) byUser.set(id, (s = { notStarted: 0, open: 0, overdue: 0 }))
            return s
        }
        for (const r of notStarted) slot(r.userId).notStarted += Number(r.n)
        for (const r of [...primary, ...additional]) {
            if (!r.userId) continue
            const s = slot(r.userId)
            s.open += Number(r.open)
            s.overdue += Number(r.overdue)
        }

        // Only people with something to chase: a run not started, or an overdue delegation.
        const flagged = [...byUser.entries()].filter(([, s]) => s.notStarted > 0 || s.overdue > 0)
        if (!flagged.length) return []
        const names = await db
            .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(inArray(users.id, flagged.map(([id]) => id)))
        const nameOf = new Map(names.map((n) => [n.id, [n.firstName, n.lastName].filter(Boolean).join(" ")]))

        return flagged
            .map(([id, s]) => ({
                userId: id,
                name: nameOf.get(id) ?? "Unknown",
                notStartedRuns: s.notStarted,
                openDelegations: s.open,
                overdueDelegations: s.overdue,
            }))
            .sort((a, b) => b.overdueDelegations + b.notStartedRuns - (a.overdueDelegations + a.notStartedRuns) || a.name.localeCompare(b.name))
            .slice(0, PEOPLE_LIMIT)
    },
}

const PEOPLE_LIMIT = 15

export interface PersonStatus {
    userId: string
    name: string
    /** Runs open today that this person has not ticked a single question on. */
    notStartedRuns: number
    openDelegations: number
    overdueDelegations: number
}
