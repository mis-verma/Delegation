import type { Request, Response } from "express"
import { checklistInstanceItemSubmissionImageService } from "./checklistInstanceItemSubmissionImage.service.js"
import { uploadChecklistInstanceItemSubmissionImageSchema } from "../checklistInstanceItemSubmissions/checklistInstanceItemSubmission.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"

export const checklistInstanceItemSubmissionImageController = {
    upload: asyncHandler(async (req: Request, res: Response) => {
        const { captureMethod } = uploadChecklistInstanceItemSubmissionImageSchema.parse(req.body)
        const files = (req.files as Express.Multer.File[]) ?? []
        const images = await checklistInstanceItemSubmissionImageService.upload(routeParam(req, "id"), files, captureMethod, req.user!)
        res.status(201).json({ success: true, data: images })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await checklistInstanceItemSubmissionImageService.remove(routeParam(req, "id"), req.user!)
        res.json({ success: true, data: { deleted: true } })
    }),
}
