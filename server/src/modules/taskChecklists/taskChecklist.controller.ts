import type { Request, Response } from "express";
import { taskChecklistService } from "./taskChecklist.service.js";
import { createTaskChecklistSchema, updateTaskChecklistItemSchema, updateRemarksSchema } from "./taskChecklist.validation.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const taskChecklistController = {

    createForTask: asyncHandler(async (req: Request, res: Response) => {
        const input = createTaskChecklistSchema.parse(req.body);
        const checklist = await taskChecklistService.createForTask(req.params.taskId, input, req.user!)
        res.status(201).json({ success: true, data: checklist })
    }),

    createFromTemplate: asyncHandler(async (req: Request, res: Response) => {
        const checklist = await taskChecklistService.createFromTemplate(req.params.taskId, req.params.templateId, req.user!)
        res.status(201).json({ success: true, data: checklist })
    }),

    updateItem: asyncHandler(async (req: Request, res: Response) => {
        const input = updateTaskChecklistItemSchema.parse(req.body)
        const item = await taskChecklistService.updateItem(req.params.id, input, req.user!)
        res.json({ success: true, data: item })
    }),

    completeItem: asyncHandler(async (req: Request, res: Response) => {
        const item = await taskChecklistService.completeItem(req.params.id, req.user!)
        res.json({ success: true, data: item })
    }),

    updateRemarks: asyncHandler(async (req: Request, res: Response) => {
        const { remarks } = updateRemarksSchema.parse(req.body);
        const item = await taskChecklistService.updateRemarks(req.params.id, remarks, req.user!);
        res.json({ success: true, data: item });
    }),

    removeChecklist : asyncHandler(async (req : Request , res : Response) => {
        await taskChecklistService.removeChecklist(req.params.id, req.user!)
        res.json({ success : true , data : { deleted : true}})
    }),

    removeItem : asyncHandler(async (req : Request , res : Response) => {
        await taskChecklistService.removeItem(req.params.id, req.user!)
        res.json({ success : true , data : { deleted : true}})
    })
}