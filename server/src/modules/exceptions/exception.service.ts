import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstances, stores, tickets } from "../../db/schema/index.js"
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
}
