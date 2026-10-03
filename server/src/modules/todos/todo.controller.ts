import type { Request, Response } from "express"
import { todoService } from "./todo.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { createTodoSchema, updateTodoSchema, listTodosQuerySchema } from "./todo.validation.js"

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
        const todo = await todoService.update(req.params.id, req.user!.sub, input)
        res.json({ success: true, data: todo })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await todoService.remove(req.params.id, req.user!.sub)
        res.json({ success: true, data: { deleted: true } })
    }),
}
