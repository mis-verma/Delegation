import type { Request, Response } from "express"
import { holidayService } from "./holiday.service.js"
import { createHolidaySchema, createHolidaysSchema, listHolidaysQuerySchema, previewHolidayQuerySchema } from "./holiday.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"

export const holidayController = {
    // GET /holidays?year=2026
    list: asyncHandler(async (req: Request, res: Response) => {
        const { year } = listHolidaysQuerySchema.parse(req.query)
        res.json({ success: true, data: await holidayService.list(year) })
    }),

    // POST /holidays { date, name } — also reports how many unstarted runs that day were cleared.
    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createHolidaySchema.parse(req.body)
        const { holiday, removedRuns } = await holidayService.create(input, req.user!.sub)
        res.status(201).json({ success: true, data: holiday, removedRuns })
    }),

    // POST /holidays/bulk { holidays: [{ date, name }] }
    createMany: asyncHandler(async (req: Request, res: Response) => {
        const { holidays } = createHolidaysSchema.parse(req.body)
        res.status(201).json({ success: true, ...(await holidayService.createMany(holidays, req.user!.sub)) })
    }),

    // GET /holidays/preview?date=YYYY-MM-DD -> { success, data: { untouchedRuns, startedRuns } }
    // untouchedRuns would be removed by adding the holiday, startedRuns would stay. Nothing is written.
    preview: asyncHandler(async (req: Request, res: Response) => {
        const { date } = previewHolidayQuerySchema.parse(req.query)
        res.json({ success: true, data: await holidayService.preview(date) })
    }),

    // DELETE /holidays/:id -> { success, backfilled }: false for a past date (the generator never
    // back-fills past days), true for today or a later date.
    remove: asyncHandler(async (req: Request, res: Response) => {
        const { backfilled } = await holidayService.remove(req.params.id, req.user!.sub)
        res.json({ success: true, backfilled })
    }),
}
