import { z } from "zod"
import { TODO_PRIORITIES } from "../../db/schema/task.js"

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

export type CreateTodoInput = z.infer<typeof createTodoSchema>
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>
