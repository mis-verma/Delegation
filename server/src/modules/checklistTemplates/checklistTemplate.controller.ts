import type { Request, Response } from "express"
import { checklistTemplateService } from "./checklistTemplate.service.js"
import {
    createChecklistTemplateSchema,
    updateChecklistTemplateSchema,
    createChecklistTemplateItemSchema,
    updateChecklistTemplateItemSchema,
} from "./checklistTemplate.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"

export const checklistTemplateController = {
    list: asyncHandler(async (req: Request, res: Response) => {
        const appliesTo = req.query.appliesTo as "TASK" | "TICKET" | undefined
        const templates = await checklistTemplateService.list(appliesTo)
        res.json({ success: true, data: templates })
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const template = await checklistTemplateService.getById(req.params.id)
        res.json({ success: true, data: template })
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createChecklistTemplateSchema.parse(req.body)
        const template = await checklistTemplateService.create(input, req.user!)
        res.status(201).json({ success: true, data: template })
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const input = updateChecklistTemplateSchema.parse(req.body)
        const template = await checklistTemplateService.update(req.params.id, input, req.user!.sub)
        res.json({ success: true, data: template })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await checklistTemplateService.remove(req.params.id, req.user!.sub)
        res.json({ success: true, data: { deleted: true } })
    }),

    addItem: asyncHandler(async (req: Request, res: Response) => {
        const input = createChecklistTemplateItemSchema.parse(req.body)
        const item = await checklistTemplateService.addItem(req.params.templateId, input)
        res.status(201).json({ success: true, data: item })
    }),

    updateItem: asyncHandler(async (req: Request, res: Response) => {
        const input = updateChecklistTemplateItemSchema.parse(req.body)
        const item = await checklistTemplateService.updateItem(req.params.id, input)
        res.json({ success: true, data: item })
    }),

    removeItem: asyncHandler(async (req: Request, res: Response) => {
        await checklistTemplateService.removeItem(req.params.id)
        res.json({ success: true, data: { deleted: true } })
    }),
}