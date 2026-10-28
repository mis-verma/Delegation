import { and, asc, eq, gte, inArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { categories, departments } from "../../db/schema/core.js"
import { tickets, ticketStatusUpdates } from "../../db/schema/ticket.js"
import { NOT_DELETED } from "../tickets/ticketShared.js"
import { buildCategoryTat, type CategoryTatReport, type TatTicket, type TatUpdate } from "./categoryTat.js"

export const TAT_WINDOW_DAYS = [30, 90, 180, 365, 0] as const

const DAY_MS = 24 * 60 * 60 * 1000
const UPDATE_CHUNK = 500

export const categoryTatService = {
    async report(days: number): Promise<CategoryTatReport> {
        const since = days > 0 ? new Date(Date.now() - days * DAY_MS) : null

        const categoryRows = await db
            .select({ id: categories.id, name: categories.name, isActive: categories.isActive, tatHours: categories.tatHours, departmentName: departments.name })
            .from(categories)
            .leftJoin(departments, eq(categories.departmentId, departments.id))

        const ticketRows: TatTicket[] = await db
            .select({
                id: tickets.id,
                categoryId: tickets.categoryId,
                createdAt: tickets.createdAt,
                closedAt: tickets.closedAt,
                declinedAt: tickets.declinedAt,
                status: tickets.status,
                tatDueAt: tickets.tatDueAt,
            })
            .from(tickets)
            .where(and(NOT_DELETED, since ? gte(tickets.createdAt, since) : undefined))

        const updates: TatUpdate[] = []
        for (let start = 0; start < ticketRows.length; start += UPDATE_CHUNK) {
            const ids = ticketRows.slice(start, start + UPDATE_CHUNK).map((ticket) => ticket.id)
            const chunk = await db
                .select({ ticketId: ticketStatusUpdates.ticketId, toStatus: ticketStatusUpdates.toStatus, createdAt: ticketStatusUpdates.createdAt })
                .from(ticketStatusUpdates)
                .where(inArray(ticketStatusUpdates.ticketId, ids))
                .orderBy(asc(ticketStatusUpdates.createdAt))
            updates.push(...chunk)
        }

        return buildCategoryTat(categoryRows, ticketRows, updates)
    },
}
