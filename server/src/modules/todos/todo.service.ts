import { db } from "../../config/db.js"
import { todos } from "../../db/schema/task.js"
import { eq, and, desc, sql, inArray } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import { cached, cacheKey, invalidateKeys } from "../../config/queryCache.js"
import { orgDayStartUtc } from "../../utils/orgDay.js"
import { utcSql } from "../checklistInstances/checklistReportRange.js"
import type { CreateTodoInput, RestoreTodosInput, UpdateTodoInput } from "./todo.validation.js"

export type TodoSummaryRow = {
    total: number
    pending: number
    newToday: number
    due: number
    overdue: number
    completed: number
}

const TODO_SUMMARY_PREFIX = "todo-summary"
const SUMMARY_TTL_SECONDS = 10
const dropTodoSummary = (userId: string) => invalidateKeys(cacheKey(TODO_SUMMARY_PREFIX, userId))

const MAX_TODOS_PER_LIST = 1000

export const todoService = {
    async listForUser(userId: string, limit?: number) {
        const query = db.select().from(todos).where(eq(todos.userId, userId)).orderBy(desc(todos.createdAt))
        return query.limit(limit ?? MAX_TODOS_PER_LIST)
    },

    async summary(userId: string): Promise<TodoSummaryRow> {
        return cached(cacheKey(TODO_SUMMARY_PREFIX, userId), SUMMARY_TTL_SECONDS, async () => {
            const [row] = await db.select({
                total: sql<number>`COUNT(*)`,
                completed: sql<number>`SUM(CASE WHEN ${todos.completed} THEN 1 ELSE 0 END)`,
                overdue: sql<number>`SUM(CASE WHEN NOT ${todos.completed} AND ${todos.dueDate} IS NOT NULL AND ${todos.dueDate} < ${utcSql(new Date())} THEN 1 ELSE 0 END)`,
                newToday: sql<number>`SUM(CASE WHEN ${todos.createdAt} >= ${utcSql(orgDayStartUtc())} THEN 1 ELSE 0 END)`,
            }).from(todos).where(eq(todos.userId, userId))

            const total = Number(row?.total ?? 0)
            const completed = Number(row?.completed ?? 0)
            const overdue = Number(row?.overdue ?? 0)
            return {
                total,
                pending: total - completed,
                newToday: Number(row?.newToday ?? 0),
                due: total - completed - overdue,
                overdue,
                completed,
            }
        })
    },

    async create(userId: string, input: CreateTodoInput) {
        const id = createId();
        await db.insert(todos).values({
            id,
            userId,
            text: input.text,
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
        });
        const [todo] = await db.select().from(todos).where(eq(todos.id, id)).limit(1);
        await dropTodoSummary(userId)
        return todo
    },

    async update(id: string, userId: string, input: UpdateTodoInput) {
        const [existing] = await db.select().from(todos).where(and(eq(todos.id, id), eq(todos.userId, userId))).limit(1);
        if (!existing) throw AppError.notFound('Todo not found')

        await db.update(todos).set({
            ...(input.text !== undefined ? { text: input.text } : {}),
            ...(input.completed !== undefined ? { completed: input.completed } : {}),
            ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
            updatedAt: new Date(),
        }).where(eq(todos.id, id));

        const [todo] = await db.select().from(todos).where(eq(todos.id, id)).limit(1);
        await dropTodoSummary(userId)
        return todo
    },

    async remove(id: string, userId: string) {
        const [existing] = await db.select().from(todos).where(and(eq(todos.id, id), eq(todos.userId, userId))).limit(1);
        if (!existing) throw AppError.notFound('Todo not found')
        await db.delete(todos).where(eq(todos.id, id));
        await dropTodoSummary(userId)
    },

    async clearCompleted(userId: string, ids: string[]) {
        const [result] = await db.delete(todos).where(and(eq(todos.userId, userId), eq(todos.completed, true), inArray(todos.id, ids)))
        await dropTodoSummary(userId)
        return { deleted: result.affectedRows }
    },

    async restore(userId: string, input: RestoreTodosInput["todos"]) {
        const now = new Date()
        const rows = input.map((item) => ({
            id: createId(),
            userId,
            text: item.text,
            completed: item.completed,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            ...(item.priority !== undefined ? { priority: item.priority } : {}),
            createdAt: item.createdAt ? new Date(item.createdAt) : now,
            updatedAt: now,
        }))
        await db.insert(todos).values(rows)
        await dropTodoSummary(userId)
        return { restored: rows.length }
    },
}
