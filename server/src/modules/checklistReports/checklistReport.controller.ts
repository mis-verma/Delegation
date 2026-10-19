import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { checklistReportExportQuerySchema, checklistReportQuerySchema } from "./checklistReport.validation.js"
import { checklistReportService, csvGrouping, streamReportCsv, writeReportXlsx } from "./checklistReport.service.js"
import { cachedReport } from "../../utils/reportCache.js"

const CONTENT_TYPES = {
    csv: "text/csv; charset=utf-8",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const

export const checklistReportController = {
    preview: asyncHandler(async (req: Request, res: Response) => {
        const query = checklistReportQuerySchema.parse(req.query)
        const report = await cachedReport("people", req, () => checklistReportService.build(req.user!, query))
        res.json({ success: true, data: report })
    }),

    export: asyncHandler(async (req: Request, res: Response) => {
        const { format, ...query } = checklistReportExportQuerySchema.parse(req.query)
        const report = await checklistReportService.build(req.user!, query)
        const filename = `checklist-report-${query.from}_to_${query.to}.${format}`
        res.setHeader("Content-Type", CONTENT_TYPES[format])
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
        if (format === "csv") {
            await streamReportCsv(res, report, csvGrouping(query.groupBy))
            return
        }
        await writeReportXlsx(res, report, query.groupBy)
    }),
}
