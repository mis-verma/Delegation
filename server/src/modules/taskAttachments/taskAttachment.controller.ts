import type { Request, Response } from "express"
import { taskAttachmentService } from "./taskAttachment.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"

export const taskAttachmentController = {
    upload: asyncHandler(async (req: Request, res: Response) => {
        const files = (req.files as Express.Multer.File[]) ?? [];
        const attachments = await taskAttachmentService.upload(routeParam(req, "id"), files, req.user!);
        res.status(201).json({ success: true, data: attachments });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await taskAttachmentService.remove(routeParam(req, "id"), req.user!);
        res.json({ success: true, data: { deleted: true } });
    }),
}
