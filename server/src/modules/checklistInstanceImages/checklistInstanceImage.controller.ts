import type { Request, Response } from "express"
import { checklistInstanceImageService } from "./checklistInstanceImage.service.js"
import { uploadChecklistInstanceImageSchema } from "../checklistInstances/checklistInstance.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"

export const checklistInstanceImageController = {

    upload: asyncHandler(async (req: Request, res: Response) => {
        const { captureMethod } = uploadChecklistInstanceImageSchema.parse(req.body);
        const files = (req.files as Express.Multer.File[]) ?? [];
        const images = await checklistInstanceImageService.upload(req.params.id, files, captureMethod, req.user!);
        res.status(201).json({ success: true, data: images });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await checklistInstanceImageService.remove(req.params.id, req.user!);
        res.json({ success: true, data: { deleted: true } });
    }),
}
