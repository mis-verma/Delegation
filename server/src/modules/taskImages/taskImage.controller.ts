import type { Request, Response } from "express"
import { taskImageService } from "./taskImage.service.js"
import { uploadImageSchema } from "./taskImage.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"

export const taskImageController = {
    upload: asyncHandler(async (req: Request, res: Response) => {
        const { captureMethod } = uploadImageSchema.parse(req.body);
        const files = (req.files as Express.Multer.File[]) ?? [];
        const images = await taskImageService.upload(routeParam(req, "id"), files, captureMethod, req.user!);
        res.status(201).json({ success: true, data: images });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await taskImageService.remove(routeParam(req, "id"), req.user!);
        res.json({ success: true, data: { deleted: true } });
    }),
}