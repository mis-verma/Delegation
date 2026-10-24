import type { Request, Response } from "express"
import { checklistInstanceImageService } from "./checklistInstanceImage.service.js"
import { uploadChecklistInstanceImageSchema } from "../checklistInstances/checklistInstance.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"

export const checklistInstanceImageController = {

    upload: asyncHandler(async (req: Request, res: Response) => {
        const { captureMethod, purpose } = uploadChecklistInstanceImageSchema.parse(req.body);
        const files = (req.files as Express.Multer.File[]) ?? [];
        const images = await checklistInstanceImageService.upload(routeParam(req, "id"), files, captureMethod, purpose, req.user!);
        res.status(201).json({ success: true, data: images });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await checklistInstanceImageService.remove(routeParam(req, "id"), req.user!);
        res.json({ success: true, data: { deleted: true } });
    }),
}
