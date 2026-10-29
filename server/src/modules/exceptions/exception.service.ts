import { and, eq, inArray, isNotNull, isNull, lte, notInArray, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstances, stores, tasks, tickets, users } from "../../db/schema/index.js"
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

export const exceptionService = {
    async list(user: AccessTokenPayload): Promise<ExceptionItem[]> {
        const now = Date.now()
        const items: ExceptionItem[] = []

        const ticketScope = isDepartmentHeadRole(user.role)
            ? user.departmentId ? eq(tickets.departmentId, user.departmentId) : sql`1 = 0`
            : await visibilityFilter(user)
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
                personFirst: users.firstName,
                personLast: users.lastName,
            })
            .from(tickets)
            .leftJoin(stores, eq(stores.id, tickets.storeId))
            .leftJoin(users, eq(users.id, tickets.assigneeId))
            .where(and(
                isNull(tickets.deletedAt),
                NOT_GATED,
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
                person: personName(t.personFirst, t.personLast),
                remindedAt: t.remindedAt ? t.remindedAt.toISOString() : null,
            })
        }

        const taskScope = isAdminOrPc(user.role)
            ? undefined
            : user.departmentId ? eq(tasks.departmentId, user.departmentId) : sql`1 = 0`
        const taskRows = await db
            .select({
                id: tasks.id,
                title: tasks.title,
                priority: tasks.priority,
                dueDate: tasks.dueDate,
                remindedAt: tasks.overdueNotifiedAt,
                personFirst: users.firstName,
                personLast: users.lastName,
            })
            .from(tasks)
            .leftJoin(users, eq(users.id, tasks.assigneeId))
            .where(and(
                isNull(tasks.deletedAt),
                isNull(tasks.declinedAt),
                eq(tasks.awaitingHeadApproval, false),
                notInArray(tasks.status, ["done", "draft", "pending_approval"]),
                isNotNull(tasks.dueDate),
                lte(tasks.dueDate, new Date(now)),
                taskScope,
            ))
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
                person: personName(t.personFirst, t.personLast),
                remindedAt: t.remindedAt ? t.remindedAt.toISOString() : null,
            })
        }

        const orgWide = isAdminOrPc(user.role)
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
                    sql`${runClosingSql} <= ${localNowExpr}`,
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
                    person: null,
                    remindedAt: null,
                })
            }
        }

        return items.sort((a, b) => (a.severity === b.severity ? a.since.localeCompare(b.since) : a.severity === "high" ? -1 : 1))
    },
}
