import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { extraWorkingDayService } from "./extraWorkingDay.service.js"
import { createExtraWorkingDaySchema, listExtraWorkingDaysQuerySchema } from "./extraWorkingDay.validation.js"

export const extraWorkingDayController = {
    // GET /extra-working-days?year=2026
    list: asyncHandler(async (req: Request, res: Response) => {
        const { year } = listExtraWorkingDaysQuerySchema.parse(req.query)
        res.json({ success: true, data: await extraWorkingDayService.list(year) })
    }),

    // GET /extra-working-days/mine -> the days that cover the signed-in person, yesterday onwards
    mine: asyncHandler(async (req: Request, res: Response) => {
        res.json({ success: true, data: await extraWorkingDayService.mine(req.user!.sub) })
    }),

    // POST /extra-working-days { date, reason, scope, targetIds }
    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createExtraWorkingDaySchema.parse(req.body)
        res.status(201).json({ success: true, data: await extraWorkingDayService.create(input, req.user!.sub) })
    }),

    // DELETE /extra-working-days/:id -> { success, removedRuns }
    remove: asyncHandler(async (req: Request, res: Response) => {
        const { removedRuns } = await extraWorkingDayService.remove(req.params.id, req.user!.sub)
        res.json({ success: true, removedRuns })
    }),
}
