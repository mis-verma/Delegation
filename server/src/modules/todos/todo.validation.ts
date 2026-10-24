import { z } from "zod"
import { TODO_PRIORITIES } from "../../db/schema/task.js"
import { objectId } from "../../utils/index.js"

export const createTodoSchema = z.object({
    text: z.string().trim().min(1, "Text is required"),
    dueDate: z.string().datetime().optional(),
    priority: z.enum(TODO_PRIORITIES).optional(),
})

export const listTodosQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
})

export const updateTodoSchema = z.object({
    text: z.string().trim().min(1).optional(),
    completed: z.boolean().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    priority: z.enum(TODO_PRIORITIES).optional(),
})

export const clearCompletedSchema = z.object({
    ids: z.array(objectId).min(1).max(500),
})

export const restoreTodosSchema = z.object({
    todos: z.array(z.object({
        text: z.string().trim().min(1),
        completed: z.boolean().default(false),
        dueDate: z.string().datetime().nullable().optional(),
        priority: z.enum(TODO_PRIORITIES).optional(),
        createdAt: z.string().datetime().optional(),
    })).min(1).max(500),
})

export type CreateTodoInput = z.infer<typeof createTodoSchema>
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>
export type RestoreTodosInput = z.infer<typeof restoreTodosSchema>
