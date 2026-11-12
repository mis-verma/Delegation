import { z } from "zod"
import { TODO_PRIORITIES } from "../../db/schema/task.js"
import { objectId } from "../../utils/index.js"
import { TODO_IMPORT_MAX_ROWS, TODO_TEXT_MAX } from "./todoImport.js"

export const createTodoSchema = z.object({
    text: z.string().trim().min(1, "Text is required").max(TODO_TEXT_MAX, `Keep it under ${TODO_TEXT_MAX} characters`),
    dueDate: z.string().datetime().optional(),
    priority: z.enum(TODO_PRIORITIES).optional(),
})

export const listTodosQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
})

export const updateTodoSchema = z.object({
    text: z.string().trim().min(1).max(TODO_TEXT_MAX).optional(),
    completed: z.boolean().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    priority: z.enum(TODO_PRIORITIES).optional(),
})

export const clearCompletedSchema = z.object({
    ids: z.array(objectId).min(1).max(500),
})

export const restoreTodosSchema = z.object({
    todos: z.array(z.object({
        text: z.string().trim().min(1).max(TODO_TEXT_MAX),
        completed: z.boolean().default(false),
        dueDate: z.string().datetime().nullable().optional(),
        priority: z.enum(TODO_PRIORITIES).optional(),
        createdAt: z.string().datetime().optional(),
    })).min(1).max(500),
})

export const importTodosSchema = z.object({
    todos: z.array(z.object({
        text: z.string().trim().min(1).max(TODO_TEXT_MAX),
        completed: z.boolean().default(false),
        dueDate: z.string().datetime().nullable().optional(),
        priority: z.enum(TODO_PRIORITIES).optional(),
    })).min(1).max(TODO_IMPORT_MAX_ROWS),
})

export type CreateTodoInput = z.infer<typeof createTodoSchema>
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>
export type RestoreTodosInput = z.infer<typeof restoreTodosSchema>
export type ImportTodosInput = z.infer<typeof importTodosSchema>
