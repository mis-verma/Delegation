import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { checklistReportExportQuerySchema, checklistReportQuerySchema } from "./checklistReport.validation.js"
import { checklistReportService, csvGrouping, streamReportCsv, writeReportXlsx } from "./checklistReport.service.js"

const CONTENT_TYPES = {
    csv: "text/csv; charset=utf-8",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const

export const checklistReportController = {
    // GET /checklist-reports/people?from=&to=&storeId=&departmentId=&groupBy=person|department|both
    // JSON for the on-screen preview.
    preview: asyncHandler(async (req: Request, res: Response) => {
        const query = checklistReportQuerySchema.parse(req.query)
        const report = await checklistReportService.build(req.user!, query)
        res.json({ success: true, data: report })
    }),

    // GET /checklist-reports/export?same params&format=xlsx|csv
    // The report is fully built before any header is written, so a failure still comes back as a
    // normal JSON error instead of a half-written file.
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
