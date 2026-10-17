import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { draftService } from "./draft.service.js"
import { createDraftSchema, listDraftsQuerySchema, updateDraftSchema } from "./draft.validation.js"

export const draftController = {
    list: asyncHandler(async (req: Request, res: Response) => {
        const { kind } = listDraftsQuerySchema.parse(req.query)
        const data = await draftService.list(req.user!, kind)
        res.json({ success: true, data })
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const data = await draftService.get(req.params.id, req.user!)
        res.json({ success: true, data })
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createDraftSchema.parse(req.body)
        const data = await draftService.create(req.user!, input)
        res.status(201).json({ success: true, data })
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const input = updateDraftSchema.parse(req.body)
        const data = await draftService.update(req.params.id, req.user!, input)
        res.json({ success: true, data })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await draftService.remove(req.params.id, req.user!)
        res.json({ success: true, data: { deleted: true } })
    }),
}
