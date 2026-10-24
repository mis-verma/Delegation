import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { extraWorkingDayService } from "./extraWorkingDay.service.js"
import { createExtraWorkingDaySchema, listExtraWorkingDaysQuerySchema } from "./extraWorkingDay.validation.js"
import { routeParam } from "../../utils/routeParam.js"

export const extraWorkingDayController = {
    list: asyncHandler(async (req: Request, res: Response) => {
        const { year } = listExtraWorkingDaysQuerySchema.parse(req.query)
        res.json({ success: true, data: await extraWorkingDayService.list(year) })
    }),

    mine: asyncHandler(async (req: Request, res: Response) => {
        res.json({ success: true, data: await extraWorkingDayService.mine(req.user!.sub) })
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createExtraWorkingDaySchema.parse(req.body)
        res.status(201).json({ success: true, data: await extraWorkingDayService.create(input, req.user!.sub) })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        const { removedRuns } = await extraWorkingDayService.remove(routeParam(req, "id"), req.user!.sub)
        res.json({ success: true, removedRuns })
    }),
}
