import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { AppError } from "../../utils/AppError.js"
import { ticketBulkImportService } from "./ticketBulkImport.service.js"
import { buildTicketImportTemplate } from "./ticketImportTemplate.js"
import { ticketBulkImportPublishSchema } from "./ticketBulkImport.validation.js"

export const ticketBulkImportController = {
    template: asyncHandler(async (req: Request, res: Response) => {
        const file = await buildTicketImportTemplate(req.user!)
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        res.setHeader("Content-Disposition", 'attachment; filename="ticket-import-template.xlsx"')
        res.send(file)
    }),

    preview: asyncHandler(async (req: Request, res: Response) => {
        if (!req.file) throw AppError.badRequest("A file is required.")
        const { rows: rawRows } = await ticketBulkImportService.parseFile(req.file.buffer, req.file.mimetype)
        if (!rawRows.length) throw AppError.unprocessable("No usable rows were found in this file.")
        const result = await ticketBulkImportService.matchRows(rawRows, req.user!)
        res.json({ success: true, data: result })
    }),

    publish: asyncHandler(async (req: Request, res: Response) => {
        const input = ticketBulkImportPublishSchema.parse(req.body)
        const summary = await ticketBulkImportService.applyBatch(input.rows, req.user!)
        res.json({ success: true, data: summary })
    }),
}
