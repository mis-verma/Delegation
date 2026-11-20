import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { AppError } from "../../utils/AppError.js"
import { env } from "../../config/env.js"
import { readAlarmSnoozeToken } from "./checklistAlarmToken.js"
import { snoozeAlarm } from "./checklistAlarm.js"

const snoozePublicSchema = z.object({
    token: z.string().min(1),
    minutes: z.union([z.literal(10), z.literal(30)]),
})

export const checklistAlarmPublicRouter = Router()

checklistAlarmPublicRouter.post("/snooze", asyncHandler(async (req: Request, res: Response) => {
    const { token, minutes } = snoozePublicSchema.parse(req.body)
    const read = readAlarmSnoozeToken(token, env.JWT_ACCESS_SECRET)
    if (!read) throw AppError.badRequest("This snooze link has expired. Open the checklist in the app instead.")
    const result = await snoozeAlarm(read.instanceId, minutes, { sub: read.userId, role: "USER" })
    res.json({ success: true, data: result })
}))
