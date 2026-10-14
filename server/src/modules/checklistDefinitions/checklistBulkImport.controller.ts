import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { AppError } from "../../utils/AppError.js"
import { checklistBulkImportService } from "./checklistBulkImport.service.js"
import { checklistBulkImportPublishSchema } from "./checklistBulkImport.validation.js"

export const checklistBulkImportController = {
    
    preview: asyncHandler(async (req: Request, res: Response) => {
        if (!req.file) throw AppError.badRequest("A file is required.")
        const { rows: rawRows, warnings } = await checklistBulkImportService.parseFile(req.file.buffer, req.file.mimetype)
        if (!rawRows.length) throw AppError.unprocessable("No usable rows were found in this file.")
        const result = await checklistBulkImportService.matchRows(rawRows)
        res.json({ success: true, data: { ...result, warnings } })
    }),

    publish: asyncHandler(async (req: Request, res: Response) => {
        const input = checklistBulkImportPublishSchema.parse(req.body)
        const summary = await checklistBulkImportService.applyBatch(input.rows, {
            startDate: input.startDate,
            opensTime: input.opensTime,
            cutoffTime: input.cutoffTime,
        }, req.user!.sub)
        res.json({ success: true, data: summary })
    }),
}
