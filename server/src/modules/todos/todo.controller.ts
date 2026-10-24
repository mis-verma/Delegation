import type { Request, Response } from "express"
import { todoService } from "./todo.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { createTodoSchema, updateTodoSchema, listTodosQuerySchema, clearCompletedSchema, restoreTodosSchema } from "./todo.validation.js"
import { routeParam } from "../../utils/routeParam.js"

export const todoController = {
    list: asyncHandler(async (req: Request, res: Response) => {
        const { limit } = listTodosQuerySchema.parse(req.query)
        const todos = await todoService.listForUser(req.user!.sub, limit)
        res.json({ success: true, data: todos })
    }),

    summary: asyncHandler(async (req: Request, res: Response) => {
        const data = await todoService.summary(req.user!.sub)
        res.json({ success: true, data })
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createTodoSchema.parse(req.body)
        const todo = await todoService.create(req.user!.sub, input)
        res.status(201).json({ success: true, data: todo })
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const input = updateTodoSchema.parse(req.body)
        const todo = await todoService.update(routeParam(req, "id"), req.user!.sub, input)
        res.json({ success: true, data: todo })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await todoService.remove(routeParam(req, "id"), req.user!.sub)
        res.json({ success: true, data: { deleted: true } })
    }),

    clearCompleted: asyncHandler(async (req: Request, res: Response) => {
        const { ids } = clearCompletedSchema.parse(req.body)
        const data = await todoService.clearCompleted(req.user!.sub, ids)
        res.json({ success: true, data })
    }),

    restore: asyncHandler(async (req: Request, res: Response) => {
        const { todos } = restoreTodosSchema.parse(req.body)
        const data = await todoService.restore(req.user!.sub, todos)
        res.status(201).json({ success: true, data })
    }),
}
