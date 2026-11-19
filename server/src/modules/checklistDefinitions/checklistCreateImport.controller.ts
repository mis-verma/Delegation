import type { Request, Response } from "express"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { AppError } from "../../utils/AppError.js"
import { checklistCreateImportService } from "./checklistCreateImport.service.js"
import { checklistCreateImportPublishSchema } from "./checklistCreateImport.validation.js"
import { buildChecklistCreateImportTemplate } from "./checklistCreateImportTemplate.js"

export const checklistCreateImportController = {
    template: asyncHandler(async (_req: Request, res: Response) => {
        const file = await buildChecklistCreateImportTemplate()
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        res.setHeader("Content-Disposition", 'attachment; filename="checklist-create-template.xlsx"')
        res.send(file)
    }),

    preview: asyncHandler(async (req: Request, res: Response) => {
        if (!req.file) throw AppError.badRequest("A file is required.")
        const { rows: rawRows, warnings } = await checklistCreateImportService.parseFile(req.file.buffer, req.file.mimetype)
        if (!rawRows.length) throw AppError.unprocessable("No usable rows were found in this file.")
        const result = await checklistCreateImportService.matchRows(rawRows)
        res.json({ success: true, data: { ...result, warnings } })
    }),

    publish: asyncHandler(async (req: Request, res: Response) => {
        const input = checklistCreateImportPublishSchema.parse(req.body)
        const summary = await checklistCreateImportService.applyBatch(
            input.groups.map((g) => ({ name: g.name, recurrence: g.recurrence, storeIds: g.storeIds, assigneeIds: g.assigneeIds, items: g.items, opensTime: g.opensTime, cutoffTime: g.cutoffTime, lateUntilTime: g.lateUntilTime })),
            { startDate: input.startDate, opensTime: input.opensTime, cutoffTime: input.cutoffTime, lateUntilTime: input.lateUntilTime, responseMode: input.responseMode },
            req.user!,
        )
        res.json({ success: true, data: summary })
    }),
}
