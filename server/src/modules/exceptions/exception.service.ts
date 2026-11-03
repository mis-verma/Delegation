import { and, eq, inArray, isNotNull, isNull, lte, notInArray, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstanceAssignees, checklistInstances, stores, tasks, tickets, users } from "../../db/schema/index.js"
import { visibilityFilter } from "../tickets/ticket.service.js"
import {
    instanceInDepartmentCondition,
    isHod,
    localNowExpr,
    parentNotDeletedExpr,
} from "../checklistInstances/checklistInstance.service.js"
import { runClosingSql } from "../checklistInstances/checklistMissedRun.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { isAdminOrPc, isDepartmentHeadRole } from "../../utils/roles.js"
import { NOT_GATED } from "../tickets/ticketShared.js"

const STALE_TICKET_HOURS = 4
const PER_KIND_LIMIT = 20
const HOUR_MS = 3_600_000

export type ExceptionKind = "TICKET_OVERDUE" | "TICKET_STALE" | "TASK_OVERDUE" | "CHECKLIST_MISSED"
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
    userId: string | null
    person: string | null
    remindedAt: string | null
}

const personName = (first: string | null, last: string | null) => (first ? `${first}${last ? ` ${last}` : ""}` : null)

const ago = (ms: number) => {
    const hours = Math.floor(ms / HOUR_MS)
    if (hours < 1) return "under an hour"
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
}

export interface ExceptionTotals {
    tickets: number
    delegations: number
    missedRuns: number
    high: number
}

const ticketWhere = async (user: AccessTokenPayload, now: number): Promise<SQL | undefined> => {
    const ticketScope = isDepartmentHeadRole(user.role)
        ? user.departmentId ? eq(tickets.departmentId, user.departmentId) : sql`1 = 0`
        : await visibilityFilter(user)
    return and(
        isNull(tickets.deletedAt),
        NOT_GATED,
        inArray(tickets.status, ["OPEN", "IN_PROGRESS", "ON_HOLD"]),
        ticketScope,
        sql`(${tickets.isOverdue} = 1 OR (${tickets.priority} IN ('HIGH','CRITICAL') AND ${tickets.createdAt} <= ${new Date(now - STALE_TICKET_HOURS * HOUR_MS)}))`,
    )
}

const taskWhere = (user: AccessTokenPayload, now: number): SQL | undefined => {
    const taskScope = isAdminOrPc(user.role)
        ? undefined
        : user.departmentId ? eq(tasks.departmentId, user.departmentId) : sql`1 = 0`
    return and(
        isNull(tasks.deletedAt),
        isNull(tasks.declinedAt),
        isNull(tasks.parentTaskId),
        eq(tasks.category, "delegation"),
        eq(tasks.awaitingHeadApproval, false),
        notInArray(tasks.status, ["done", "draft", "pending_approval"]),
        isNotNull(tasks.dueDate),
        lte(tasks.dueDate, new Date(now)),
        taskScope,
    )
}

const missedWhere = (user: AccessTokenPayload): SQL | undefined => {
    const orgWide = isAdminOrPc(user.role)
    return and(
        sql`${checklistInstances.periodStart} >= DATE(${localNowExpr})`,
        sql`${runClosingSql} <= ${localNowExpr}`,
        parentNotDeletedExpr,
        isNull(checklistInstances.submittedAt),
        eq(checklistInstances.verificationStatus, "NOT_SUBMITTED"),
        orgWide ? undefined : instanceInDepartmentCondition(user.departmentId!),
    )
}

const canSeeMissed = (user: AccessTokenPayload) => isAdminOrPc(user.role) || (isHod(user) && !!user.departmentId)

export const exceptionService = {
    async totals(user: AccessTokenPayload): Promise<ExceptionTotals> {
        const now = Date.now()
        const count = sql<number>`count(*)`
        const [[tk], [dg], missed] = await Promise.all([
            db.select({ total: count, high: sql<number>`COALESCE(SUM(${tickets.priority} IN ('HIGH','CRITICAL')), 0)` }).from(tickets).where(await ticketWhere(user, now)),
            db.select({ total: count, high: sql<number>`COALESCE(SUM(${tasks.priority} = 'high'), 0)` }).from(tasks).where(taskWhere(user, now)),
            canSeeMissed(user)
                ? db.select({ total: count }).from(checklistInstances).innerJoin(stores, eq(stores.id, checklistInstances.storeId)).where(missedWhere(user))
                : Promise.resolve([{ total: 0 }]),
        ])
        const missedTotal = Number(missed[0]?.total ?? 0)
        return {
            tickets: Number(tk?.total ?? 0),
            delegations: Number(dg?.total ?? 0),
            missedRuns: missedTotal,
            high: Number(tk?.high ?? 0) + Number(dg?.high ?? 0) + missedTotal,
        }
    },

    async list(user: AccessTokenPayload): Promise<ExceptionItem[]> {
        const now = Date.now()
        const items: ExceptionItem[] = []

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
                remindedAt: tickets.overdueNotifiedAt,
                assigneeId: tickets.assigneeId,
                personFirst: users.firstName,
                personLast: users.lastName,
            })
            .from(tickets)
            .leftJoin(stores, eq(stores.id, tickets.storeId))
            .leftJoin(users, eq(users.id, tickets.assigneeId))
            .where(await ticketWhere(user, now))
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
                link: `/tickets?open=${t.id}`,
                userId: t.assigneeId ?? null,
                person: personName(t.personFirst, t.personLast),
                remindedAt: t.remindedAt ? t.remindedAt.toISOString() : null,
            })
        }

        const taskRows = await db
            .select({
                id: tasks.id,
                title: tasks.title,
                priority: tasks.priority,
                dueDate: tasks.dueDate,
                remindedAt: tasks.overdueNotifiedAt,
                assigneeId: tasks.assigneeId,
                personFirst: users.firstName,
                personLast: users.lastName,
            })
            .from(tasks)
            .leftJoin(users, eq(users.id, tasks.assigneeId))
            .where(taskWhere(user, now))
            .orderBy(tasks.dueDate)
            .limit(PER_KIND_LIMIT)
        for (const t of taskRows) {
            const urgent = t.priority === "high"
            items.push({
                id: `task:${t.id}`,
                kind: "TASK_OVERDUE",
                severity: urgent ? "high" : "medium",
                title: t.title,
                detail: `Overdue by ${ago(now - t.dueDate!.getTime())}, ${String(t.priority).toLowerCase()} priority`,
                storeName: null,
                since: t.dueDate!.toISOString(),
                link: `/tasks?open=${t.id}`,
                userId: t.assigneeId ?? null,
                person: personName(t.personFirst, t.personLast),
                remindedAt: t.remindedAt ? t.remindedAt.toISOString() : null,
            })
        }

        if (canSeeMissed(user)) {
            const missed = await db
                .select({
                    id: checklistInstances.id,
                    title: checklistInstances.title,
                    storeName: stores.name,
                })
                .from(checklistInstances)
                .innerJoin(stores, eq(stores.id, checklistInstances.storeId))
                .where(missedWhere(user))
                .limit(PER_KIND_LIMIT)
            const owners = missed.length
                ? await db
                    .select({ instanceId: checklistInstanceAssignees.instanceId, userId: users.id, first: users.firstName, last: users.lastName })
                    .from(checklistInstanceAssignees)
                    .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
                    .where(inArray(checklistInstanceAssignees.instanceId, missed.map((m) => m.id)))
                : []
            const ownerOf = new Map<string, { userId: string; name: string | null; more: number }>()
            for (const o of owners) {
                const known = ownerOf.get(o.instanceId)
                if (known) known.more += 1
                else ownerOf.set(o.instanceId, { userId: o.userId, name: personName(o.first, o.last), more: 0 })
            }
            for (const m of missed) {
                const owner = ownerOf.get(m.id)
                items.push({
                    id: `run:${m.id}`,
                    kind: "CHECKLIST_MISSED",
                    severity: "high",
                    title: m.title,
                    detail: "Today's run closed without being submitted",
                    storeName: m.storeName,
                    since: new Date(now).toISOString(),
                    link: `/checklists/${m.id}`,
                    userId: owner?.userId ?? null,
                    person: owner?.name ? `${owner.name}${owner.more ? ` +${owner.more}` : ""}` : null,
                    remindedAt: null,
                })
            }
        }

        return items.sort((a, b) => (a.severity === b.severity ? a.since.localeCompare(b.since) : a.severity === "high" ? -1 : 1))
    },
}
