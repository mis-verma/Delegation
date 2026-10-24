import type { Request, Response } from "express"
import { checklistImageService } from "./checklistImage.service.js"
import { uploadImageSchema } from "./checklistImage.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"

export const checklistImageController = {
    upload: asyncHandler(async (req: Request, res: Response) => {
        const { captureMethod } = uploadImageSchema.parse(req.body);
        const files = (req.files as Express.Multer.File[]) ?? [];
        const images = await checklistImageService.upload(routeParam(req, "id"), files, captureMethod, req.user!);
        res.status(201).json({ success: true, data: images });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await checklistImageService.remove(routeParam(req, "id"), req.user!);
        res.json({ success: true, data: { deleted: true } });
    }),
}