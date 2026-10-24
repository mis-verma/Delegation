import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { tasks, taskAdditionalAssignees, TASK_PRIORITIES, TASK_STATUSES } from "../../db/schema/index.js"
import type { TaskListBucket, TaskListCategory, TaskListSla, TaskListSort } from "./taskListParams.js"

export type TaskListScope = {
    mine?: boolean
    viewerId?: string
    handledBy?: "assignee" | "creator"
    storeDepartmentIds?: string[]
    createdFrom?: Date
    createdTo?: Date
    dueFrom?: Date
    dueTo?: Date
    sla?: TaskListSla
}

export type TaskListOptions = {
    category?: TaskListCategory
    priority?: (typeof TASK_PRIORITIES)[number][]
    departmentId?: string
    assigneeIds?: string[]
    raisedByIds?: string[]
    status?: (typeof TASK_STATUSES)[number]
}

export type TaskListCounts = {
    scopeTotal: number
    optionTotal: number
    matched: number
    pending: number
    completed: number
    due: number
    delayed: number
}

const HANDED_IN = ["done", "pending_approval"] as const

const involvesPerson = (ids: string[]): SQL =>
    or(
        inArray(tasks.assigneeId, ids),
        inArray(tasks.id, db.select({ taskId: taskAdditionalAssignees.taskId }).from(taskAdditionalAssignees).where(inArray(taskAdditionalAssignees.userId, ids))),
    )!

const isLive = (): SQL => and(eq(tasks.awaitingHeadApproval, false), isNull(tasks.declinedAt), sql`${tasks.status} <> 'draft'`)!

const isActive = (): SQL => and(isLive(), notInArray(tasks.status, [...HANDED_IN]))!

const isDelayed = (now: Date): SQL =>
    and(
        isNotNull(tasks.dueDate),
        eq(tasks.awaitingHeadApproval, false),
        notInArray(tasks.status, ["done", "draft", "pending_approval"]),
        lt(tasks.dueDate, now),
    )!

export const bucketCondition = (bucket: TaskListBucket, now: Date): SQL => {
    if (bucket === "pending") return isActive()
    if (bucket === "completed") return and(isLive(), inArray(tasks.status, [...HANDED_IN]))!
    if (bucket === "delayed") return isDelayed(now)
    return and(isActive(), sql`NOT (${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${now})`)!
}

export const scopeConditions = (scope: TaskListScope): (SQL | undefined)[] => {
    const conditions: (SQL | undefined)[] = []
    if (scope.mine && scope.viewerId) conditions.push(or(eq(tasks.userId, scope.viewerId), involvesPerson([scope.viewerId])))
    if (scope.createdFrom) conditions.push(gte(tasks.createdAt, scope.createdFrom))
    if (scope.createdTo) conditions.push(lt(tasks.createdAt, scope.createdTo))
    if (scope.dueFrom || scope.dueTo) {
        conditions.push(isNotNull(tasks.dueDate))
        if (scope.dueFrom) conditions.push(gte(tasks.dueDate, scope.dueFrom))
        if (scope.dueTo) conditions.push(lt(tasks.dueDate, scope.dueTo))
    }
    if (scope.sla === "not_done") conditions.push(notInArray(tasks.status, [...HANDED_IN]))
    if (scope.sla === "done_late") {
        conditions.push(
            inArray(tasks.status, [...HANDED_IN]),
            isNotNull(tasks.dueDate),
            sql`COALESCE(${tasks.submittedAt}, ${tasks.verifiedAt}) > ${tasks.dueDate}`,
        )
    }
    if (scope.storeDepartmentIds) {
        conditions.push(scope.storeDepartmentIds.length ? inArray(tasks.departmentId, scope.storeDepartmentIds) : sql`1 = 0`)
    }
    if (scope.viewerId && scope.handledBy === "assignee") conditions.push(involvesPerson([scope.viewerId]))
    if (scope.viewerId && scope.handledBy === "creator") conditions.push(eq(tasks.userId, scope.viewerId))
    return conditions
}

export const optionConditions = (options: TaskListOptions): (SQL | undefined)[] => {
    const conditions: (SQL | undefined)[] = []
    if (options.category === "issue") conditions.push(eq(tasks.category, "issue"))
    if (options.category === "delegation") conditions.push(eq(tasks.category, "delegation"), isNotNull(tasks.aiMeta))
    if (options.category === "task") conditions.push(eq(tasks.category, "delegation"), isNull(tasks.aiMeta))
    if (options.category === "work") conditions.push(eq(tasks.category, "delegation"))
    if (options.priority?.length) conditions.push(inArray(tasks.priority, options.priority))
    if (options.departmentId) conditions.push(eq(tasks.departmentId, options.departmentId))
    if (options.assigneeIds?.length) conditions.push(involvesPerson(options.assigneeIds))
    if (options.raisedByIds?.length) conditions.push(inArray(tasks.userId, options.raisedByIds))
    if (options.status) conditions.push(eq(tasks.status, options.status))
    return conditions
}

export const taskListOrder = (sort: TaskListSort): SQL[] => {
    const newestFirst = [desc(tasks.createdAt), desc(tasks.id)]
    if (sort === "dueDate") return [sql`${tasks.dueDate} IS NULL`, asc(tasks.dueDate), ...newestFirst]
    if (sort === "priority") return [sql`CASE ${tasks.priority} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`, ...newestFirst]
    if (sort === "title") return [asc(tasks.title), ...newestFirst]
    return newestFirst
}

export const taskListCounts = async (
    base: SQL | undefined,
    scope: SQL | undefined,
    options: SQL | undefined,
    bucket: TaskListBucket | undefined,
    now: Date,
): Promise<TaskListCounts> => {
    const where = and(base, scope)
    const optionMatch = options ?? sql`1 = 1`
    const tally = (extra?: SQL) => sql<number>`COALESCE(SUM(CASE WHEN ${extra ? and(optionMatch, extra) : optionMatch} THEN 1 ELSE 0 END), 0)`
    const [row] = await db
        .select({
            scopeTotal: sql<number>`COUNT(*)`,
            optionTotal: tally(),
            matched: tally(bucket ? bucketCondition(bucket, now) : undefined),
            pending: tally(bucketCondition("pending", now)),
            completed: tally(bucketCondition("completed", now)),
            due: tally(bucketCondition("due", now)),
            delayed: tally(bucketCondition("delayed", now)),
        })
        .from(tasks)
        .where(where)
    return {
        scopeTotal: Number(row?.scopeTotal ?? 0),
        optionTotal: Number(row?.optionTotal ?? 0),
        matched: Number(row?.matched ?? 0),
        pending: Number(row?.pending ?? 0),
        completed: Number(row?.completed ?? 0),
        due: Number(row?.due ?? 0),
        delayed: Number(row?.delayed ?? 0),
    }
}
