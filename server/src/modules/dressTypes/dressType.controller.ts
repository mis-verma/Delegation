import type { Request, Response } from "express"
import { dressTypeService } from "./dressType.service.js"
import { createDressTypeSchema, updateDressTypeSchema } from "./dressType.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"

export const dressTypeController = {
    // GET /dress-types
    list: asyncHandler(async (_req: Request, res: Response) => {
        res.json({ success: true, data: await dressTypeService.list() })
    }),

    // POST /dress-types { name, gender? }
    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createDressTypeSchema.parse(req.body)
        res.status(201).json({ success: true, data: await dressTypeService.create(input, req.user!.sub) })
    }),

    // PATCH /dress-types/:id { name?, gender?, isActive? }
    update: asyncHandler(async (req: Request, res: Response) => {
        const input = updateDressTypeSchema.parse(req.body)
        res.json({ success: true, data: await dressTypeService.update(req.params.id, input, req.user!.sub) })
    }),

    // DELETE /dress-types/:id
    remove: asyncHandler(async (req: Request, res: Response) => {
        await dressTypeService.remove(req.params.id, req.user!.sub)
        res.json({ success: true })
    }),
}
