import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { AppError } from "../../utils/AppError.js"
import { taskBulkImportService } from "./taskBulkImport.service.js"
import { taskBulkImportPublishSchema } from "./taskBulkImport.validation.js"

export const taskBulkImportController = {
    preview: asyncHandler(async (req: Request, res: Response) => {
        if (!req.file) throw AppError.badRequest("A file is required.")
        const { rows: rawRows } = await taskBulkImportService.parseFile(req.file.buffer, req.file.mimetype)
        if (!rawRows.length) throw AppError.unprocessable("No usable rows were found in this file.")
        const result = await taskBulkImportService.matchRows(rawRows, req.user!)
        res.json({ success: true, data: result })
    }),

    publish: asyncHandler(async (req: Request, res: Response) => {
        const input = taskBulkImportPublishSchema.parse(req.body)
        const summary = await taskBulkImportService.applyBatch(input.rows, req.user!)
        res.json({ success: true, data: summary })
    }),
}
