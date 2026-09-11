import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { AppError } from "../../utils/AppError.js"
import { taskBulkImportService } from "./taskBulkImport.service.js"
import { taskBulkImportPublishSchema } from "./taskBulkImport.validation.js"

export const taskBulkImportController = {
    // POST /tasks/bulk-import/preview (multipart, field name "file")
    // Read-only: parses + matches the file against real users/departments/labels but creates
    // nothing — the review step lives entirely in the client until Publish is confirmed.
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
