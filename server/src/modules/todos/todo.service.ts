import { db } from "../../config/db.js"
import { todos } from "../../db/schema/task.js"
import { eq, and, desc, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import { cached, cacheKey } from "../../config/queryCache.js"
import type { CreateTodoInput, UpdateTodoInput } from "./todo.validation.js"

// Same shape task.service.ts's TaskSummaryRow uses (minus `draft` — todos have no draft concept,
// just `completed`), so the sidebar's per-entity badge can treat every summary response
// uniformly.
export type TodoSummaryRow = {
    total: number
    newToday: number
    due: number
    overdue: number
    completed: number
}

export const todoService = {
    async listForUser(userId: string) {
        return db.select().from(todos).where(eq(todos.userId, userId)).orderBy(desc(todos.createdAt))
    },

    // Backs the sidebar's "To-Do" count badge and its hover breakdown. Todos are already always
    // strictly per-user (no department/org visibility concept to narrow, unlike Task/Ticket), so
    // there's no separate "mine vs everything I can see" distinction to make here.
    async summary(userId: string): Promise<TodoSummaryRow> {
        // Same 30s cache/reasoning as task.service.ts#summary and
        // checklistInstance.service.ts#summary.
        return cached(cacheKey("todo-summary", userId), 30, async () => {
            const [row] = await db.select({
                total: sql<number>`COUNT(*)`,
                completed: sql<number>`SUM(CASE WHEN ${todos.completed} THEN 1 ELSE 0 END)`,
                // Matches the client's own todoRow overdue rule (KpiStrip.tsx): incomplete AND a
                // due date that's already passed. A todo with no due date at all can never be
                // overdue, only due.
                overdue: sql<number>`SUM(CASE WHEN NOT ${todos.completed} AND ${todos.dueDate} IS NOT NULL AND ${todos.dueDate} < NOW() THEN 1 ELSE 0 END)`,
                newToday: sql<number>`SUM(CASE WHEN ${todos.createdAt} >= CURDATE() THEN 1 ELSE 0 END)`,
            }).from(todos).where(eq(todos.userId, userId))

            const total = Number(row?.total ?? 0)
            const completed = Number(row?.completed ?? 0)
            const overdue = Number(row?.overdue ?? 0)
            return {
                total,
                newToday: Number(row?.newToday ?? 0),
                due: total - completed - overdue,
                overdue,
                completed,
            }
        })
    },

    async create(userId: string, input: CreateTodoInput) {
        // Todo.id is a client-generated cuid (see src/db/schema/task.js) — generate it up front
        // so we already know it after the insert, no re-select needed except to reflect defaults
        // (e.g. `priority` when not supplied) back to the caller.
        const id = createId();
        await db.insert(todos).values({
            id,
            userId,
            text: input.text,
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
        });
        const [todo] = await db.select().from(todos).where(eq(todos.id, id)).limit(1);
        return todo
    },

    // { id, userId } ownership filter stops one user from editing someone else's todo
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
        return todo
    },

    async remove(id: string, userId: string) {
        const [existing] = await db.select().from(todos).where(and(eq(todos.id, id), eq(todos.userId, userId))).limit(1);
        if (!existing) throw AppError.notFound('Todo not found')
        await db.delete(todos).where(eq(todos.id, id));
    },
}
