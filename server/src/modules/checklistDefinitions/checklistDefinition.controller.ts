import type { Request, Response } from "express"
import { checklistDefinitionService } from "./checklistDefinition.service.js"
import { createChecklistDefinitionSchema, updateChecklistDefinitionSchema, setChecklistDefinitionActiveSchema, listChecklistDefinitionsQuerySchema } from "./checklistDefinition.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import type { ChecklistRecurrence } from "./checklistDefinition.service.js"

export const checklistDefinitionController = {
    // GET /checklist-definitions?storeId=&recurrence=&isActive=&page=&limit=
    // Paginated. Responds `{ success, data, meta }` — `data` is the same array shape as before,
    // so a caller that ignores `meta` still works, it just gets the first page.
    list: asyncHandler(async (req: Request, res: Response) => {
        const { storeId, recurrence, isActive } = req.query
        const { page, limit } = listChecklistDefinitionsQuerySchema.parse(req.query)
        const result = await checklistDefinitionService.list({
            storeId: storeId as string | undefined,
            recurrence: recurrence as ChecklistRecurrence | undefined,
            isActive: isActive === undefined ? undefined : isActive === "true",
            page,
            limit,
        })
        res.json({ success: true, ...result })
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const definition = await checklistDefinitionService.getById(req.params.id)
        res.json({ success: true, data: definition })
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createChecklistDefinitionSchema.parse(req.body)
        const definition = await checklistDefinitionService.create(input, req.user!)
        res.status(201).json({ success: true, data: definition })
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const input = updateChecklistDefinitionSchema.parse(req.body)
        const definition = await checklistDefinitionService.update(req.params.id, input, req.user!.sub)
        res.json({ success: true, data: definition })
    }),

    setActive: asyncHandler(async (req: Request, res: Response) => {
        const input = setChecklistDefinitionActiveSchema.parse(req.body)
        const definition = await checklistDefinitionService.setActive(req.params.id, input, req.user!.sub)
        res.json({ success: true, data: definition })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await checklistDefinitionService.remove(req.params.id, req.user!.sub)
        res.json({ success: true, data: { deleted: true } })
    }),
}
