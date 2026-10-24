import type { Request, Response } from "express";
import { taskChecklistService } from "./taskChecklist.service.js";
import { createTaskChecklistSchema, updateTaskChecklistItemSchema, updateRemarksSchema } from "./taskChecklist.validation.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { routeParam } from "../../utils/routeParam.js"

export const taskChecklistController = {

    createForTask: asyncHandler(async (req: Request, res: Response) => {
        const input = createTaskChecklistSchema.parse(req.body);
        const checklist = await taskChecklistService.createForTask(routeParam(req, "taskId"), input, req.user!)
        res.status(201).json({ success: true, data: checklist })
    }),

    createFromTemplate: asyncHandler(async (req: Request, res: Response) => {
        const checklist = await taskChecklistService.createFromTemplate(routeParam(req, "taskId"), routeParam(req, "templateId"), req.user!)
        res.status(201).json({ success: true, data: checklist })
    }),

    updateItem: asyncHandler(async (req: Request, res: Response) => {
        const input = updateTaskChecklistItemSchema.parse(req.body)
        const item = await taskChecklistService.updateItem(routeParam(req, "id"), input, req.user!)
        res.json({ success: true, data: item })
    }),

    completeItem: asyncHandler(async (req: Request, res: Response) => {
        const item = await taskChecklistService.completeItem(routeParam(req, "id"), req.user!)
        res.json({ success: true, data: item })
    }),

    updateRemarks: asyncHandler(async (req: Request, res: Response) => {
        const { remarks } = updateRemarksSchema.parse(req.body);
        const item = await taskChecklistService.updateRemarks(routeParam(req, "id"), remarks, req.user!);
        res.json({ success: true, data: item });
    }),

    removeChecklist : asyncHandler(async (req : Request , res : Response) => {
        await taskChecklistService.removeChecklist(routeParam(req, "id"), req.user!)
        res.json({ success : true , data : { deleted : true}})
    }),

    removeItem : asyncHandler(async (req : Request , res : Response) => {
        await taskChecklistService.removeItem(routeParam(req, "id"), req.user!)
        res.json({ success : true , data : { deleted : true}})
    })
}