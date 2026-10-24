import { and, asc, desc, eq, gte, inArray, isNotNull, like, lt, notInArray, or, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { tickets, ticketTags, TICKET_PRIORITIES, TICKET_STATUSES } from "../../db/schema/index.js"
import type { TicketListBucket, TicketListHandler, TicketListSort } from "./ticketListParams.js"

export type TicketListScope = {
    viewerId?: string
    handledBy?: TicketListHandler
    createdFrom?: Date
    createdTo?: Date
    dueFrom?: Date
    dueTo?: Date
    departmentId?: string
    storeId?: string
}

export type TicketListOptions = {
    status?: (typeof TICKET_STATUSES)[number]
    priority?: (typeof TICKET_PRIORITIES)[number][]
    departmentId?: string
    assigneeIds?: string[]
    raisedByIds?: string[]
    labelIds?: string[]
    search?: string
}

export type TicketListCounts = {
    scopeTotal: number
    matched: number
    pending: number
    completed: number
    due: number
    delayed: number
}

const HANDED_IN = ["CLOSED", "PENDING_APPROVAL"] as const

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c)

export const ticketBucketCondition = (bucket: TicketListBucket): SQL => {
    if (bucket === "pending") return notInArray(tickets.status, [...HANDED_IN])
    if (bucket === "completed") return inArray(tickets.status, [...HANDED_IN])
    if (bucket === "delayed") return and(eq(tickets.isOverdue, true), notInArray(tickets.status, [...HANDED_IN]))!
    return and(isNotNull(tickets.tatDueAt), notInArray(tickets.status, [...HANDED_IN]), eq(tickets.isOverdue, false))!
}

export const ticketScopeConditions = (scope: TicketListScope): (SQL | undefined)[] => {
    const conditions: (SQL | undefined)[] = []
    if (scope.viewerId && scope.handledBy === "assignee") conditions.push(eq(tickets.assigneeId, scope.viewerId))
    if (scope.viewerId && scope.handledBy === "creator") conditions.push(eq(tickets.userId, scope.viewerId))
    if (scope.createdFrom) conditions.push(gte(tickets.createdAt, scope.createdFrom))
    if (scope.createdTo) conditions.push(lt(tickets.createdAt, scope.createdTo))
    if (scope.dueFrom || scope.dueTo) {
        conditions.push(isNotNull(tickets.tatDueAt))
        if (scope.dueFrom) conditions.push(gte(tickets.tatDueAt, scope.dueFrom))
        if (scope.dueTo) conditions.push(lt(tickets.tatDueAt, scope.dueTo))
    }
    if (scope.departmentId) conditions.push(eq(tickets.departmentId, scope.departmentId))
    if (scope.storeId) conditions.push(eq(tickets.storeId, scope.storeId))
    return conditions
}

export const ticketOptionConditions = (options: TicketListOptions): (SQL | undefined)[] => {
    const conditions: (SQL | undefined)[] = []
    if (options.status) conditions.push(eq(tickets.status, options.status))
    if (options.priority?.length) conditions.push(inArray(tickets.priority, options.priority))
    if (options.departmentId) conditions.push(eq(tickets.departmentId, options.departmentId))
    if (options.assigneeIds?.length) conditions.push(inArray(tickets.assigneeId, options.assigneeIds))
    if (options.raisedByIds?.length) conditions.push(inArray(tickets.userId, options.raisedByIds))
    if (options.labelIds?.length) {
        conditions.push(inArray(tickets.id, db.select({ ticketId: ticketTags.ticketId }).from(ticketTags).where(inArray(ticketTags.tagId, options.labelIds))))
    }
    const term = options.search?.trim()
    if (term) {
        const pattern = `%${escapeLike(term)}%`
        conditions.push(or(like(tickets.title, pattern), like(tickets.description, pattern)))
    }
    return conditions
}

export const ticketListOrder = (sort: TicketListSort): SQL[] => {
    const newestFirst = [desc(tickets.createdAt), desc(tickets.id)]
    if (sort === "tatDueAt") return [sql`${tickets.tatDueAt} IS NULL`, asc(tickets.tatDueAt), ...newestFirst]
    if (sort === "priority") return [sql`CASE ${tickets.priority} WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`, ...newestFirst]
    if (sort === "title") return [asc(tickets.title), ...newestFirst]
    return newestFirst
}

export const ticketListCounts = async (
    base: SQL | undefined,
    options: SQL | undefined,
    bucket: TicketListBucket | undefined,
): Promise<TicketListCounts> => {
    const tally = (condition: SQL | undefined) => sql<number>`COALESCE(SUM(CASE WHEN ${condition ?? sql`1 = 1`} THEN 1 ELSE 0 END), 0)`
    const both = (condition: SQL | undefined) => and(options, condition)
    const [row] = await db
        .select({
            scopeTotal: sql<number>`COUNT(*)`,
            matched: tally(both(bucket ? ticketBucketCondition(bucket) : undefined)),
            pending: tally(ticketBucketCondition("pending")),
            completed: tally(ticketBucketCondition("completed")),
            due: tally(ticketBucketCondition("due")),
            delayed: tally(ticketBucketCondition("delayed")),
        })
        .from(tickets)
        .where(base)
    return {
        scopeTotal: Number(row?.scopeTotal ?? 0),
        matched: Number(row?.matched ?? 0),
        pending: Number(row?.pending ?? 0),
        completed: Number(row?.completed ?? 0),
        due: Number(row?.due ?? 0),
        delayed: Number(row?.delayed ?? 0),
    }
}
