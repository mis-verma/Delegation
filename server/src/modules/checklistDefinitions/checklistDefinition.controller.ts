import type { Request, Response } from "express"
import { checklistDefinitionService } from "./checklistDefinition.service.js"
import { createChecklistDefinitionSchema, updateChecklistDefinitionSchema, setChecklistDefinitionActiveSchema, listChecklistDefinitionsQuerySchema } from "./checklistDefinition.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import type { ChecklistRecurrence } from "./checklistDefinition.service.js"
import { routeParam } from "../../utils/routeParam.js"
import { AppError } from "../../utils/AppError.js"
import path from "node:path"

export const checklistDefinitionController = {
    uploadReferenceImage: asyncHandler(async (req: Request, res: Response) => {
        const file = req.file
        if (!file || !file.mimetype.startsWith("image/")) throw AppError.badRequest("Pick a photo to use as the example.")
        res.status(201).json({ success: true, data: { url: `/uploads/checklist-references/${path.basename(file.path)}` } })
    }),

    list: asyncHandler(async (req: Request, res: Response) => {
        const { storeId, recurrence, isActive, draft } = req.query
        const { page, limit } = listChecklistDefinitionsQuerySchema.parse(req.query)
        const result = await checklistDefinitionService.list({
            storeId: storeId as string | undefined,
            recurrence: recurrence as ChecklistRecurrence | undefined,
            isActive: isActive === undefined ? undefined : isActive === "true",
            draft: draft === undefined ? undefined : draft === "true",
            page,
            limit,
        })
        res.json({ success: true, ...result })
    }),

    scoringGaps: asyncHandler(async (_req: Request, res: Response) => {
        const data = await checklistDefinitionService.scoringGaps()
        res.json({ success: true, data })
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const definition = await checklistDefinitionService.getById(routeParam(req, "id"))
        res.json({ success: true, data: definition })
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createChecklistDefinitionSchema.parse(req.body)
        const definition = await checklistDefinitionService.create(input, req.user!)
        res.status(201).json({ success: true, data: definition })
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const input = updateChecklistDefinitionSchema.parse(req.body)
        const { definition, liveRuns, wentLive, paused, lateToday } = await checklistDefinitionService.update(routeParam(req, "id"), input, req.user!.sub)
        res.json({ success: true, data: definition, liveRuns, wentLive, paused, lateToday })
    }),

    setActive: asyncHandler(async (req: Request, res: Response) => {
        const input = setChecklistDefinitionActiveSchema.parse(req.body)
        const definition = await checklistDefinitionService.setActive(routeParam(req, "id"), input, req.user!.sub)
        res.json({ success: true, data: definition })
    }),

    restore: asyncHandler(async (req: Request, res: Response) => {
        const definition = await checklistDefinitionService.restore(routeParam(req, "id"), req.user!.sub)
        res.json({ success: true, data: definition })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await checklistDefinitionService.remove(routeParam(req, "id"), req.user!.sub)
        res.json({ success: true, data: { deleted: true } })
    }),
}
