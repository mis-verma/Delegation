import type { Request, Response } from "express"
import { holidayService } from "./holiday.service.js"
import { createHolidaySchema, createHolidaysSchema, listHolidaysQuerySchema, previewHolidayQuerySchema } from "./holiday.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"

export const holidayController = {
    list: asyncHandler(async (req: Request, res: Response) => {
        const { year } = listHolidaysQuerySchema.parse(req.query)
        res.json({ success: true, data: await holidayService.list(year) })
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createHolidaySchema.parse(req.body)
        const { holiday, removedRuns } = await holidayService.create(input, req.user!.sub)
        res.status(201).json({ success: true, data: holiday, removedRuns })
    }),

    createMany: asyncHandler(async (req: Request, res: Response) => {
        const { holidays } = createHolidaysSchema.parse(req.body)
        res.status(201).json({ success: true, ...(await holidayService.createMany(holidays, req.user!.sub)) })
    }),

    preview: asyncHandler(async (req: Request, res: Response) => {
        const { date } = previewHolidayQuerySchema.parse(req.query)
        res.json({ success: true, data: await holidayService.preview(date) })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        const { backfilled } = await holidayService.remove(routeParam(req, "id"), req.user!.sub)
        res.json({ success: true, backfilled })
    }),
}
