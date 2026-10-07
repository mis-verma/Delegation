import { type Request, type Response } from "express"
import { z } from "zod"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { activityService } from "./activity.service.js"

const querySchema = z.object({
    entityType: z.enum(["Task", "Ticket"]),
    entityId: z.string().min(1).max(191),
})

export const activityController = {
    feed: asyncHandler(async (req: Request, res: Response) => {
        const { entityType, entityId } = querySchema.parse(req.query)
        res.json({ success: true, data: await activityService.forEntity(req.user!, entityType, entityId) })
    }),
}
