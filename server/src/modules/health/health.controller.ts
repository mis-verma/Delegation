import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { healthService } from "./health.service.js"

export const healthController = {
    // GET /system-health: the admin's "is everything running?" snapshot
    snapshot: asyncHandler(async (_req: Request, res: Response) => {
        res.json({ success: true, data: await healthService.snapshot() })
    }),
}
