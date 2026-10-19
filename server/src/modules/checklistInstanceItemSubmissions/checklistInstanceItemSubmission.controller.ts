import type { Request, Response } from "express"
import { checklistInstanceItemSubmissionService } from "./checklistInstanceItemSubmission.service.js"
import {
    setChecklistInstanceItemSubmissionDoneSchema,
    setChecklistInstanceItemSubmissionDressTypeSchema,
    updateChecklistInstanceItemSubmissionAccessoriesSchema,
    updateChecklistInstanceItemSubmissionRemarksSchema,
} from "./checklistInstanceItemSubmission.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"

export const checklistInstanceItemSubmissionController = {
    setDone: asyncHandler(async (req: Request, res: Response) => {
        const input = setChecklistInstanceItemSubmissionDoneSchema.parse(req.body)
        const submission = await checklistInstanceItemSubmissionService.setDone(req.params.id, input.isDone, req.user!, {
            notApplicable: input.notApplicable,
            remarks: input.remarks,
        })
        res.json({ success: true, data: submission })
    }),

    updateAccessories: asyncHandler(async (req: Request, res: Response) => {
        const input = updateChecklistInstanceItemSubmissionAccessoriesSchema.parse(req.body)
        const submission = await checklistInstanceItemSubmissionService.updateAccessories(req.params.id, input.accessories, req.user!)
        res.json({ success: true, data: submission })
    }),

    setDressType: asyncHandler(async (req: Request, res: Response) => {
        const input = setChecklistInstanceItemSubmissionDressTypeSchema.parse(req.body)
        const submission = await checklistInstanceItemSubmissionService.setDressType(req.params.id, input.dressTypeId, req.user!)
        res.json({ success: true, data: submission })
    }),

    updateRemarks: asyncHandler(async (req: Request, res: Response) => {
        const input = updateChecklistInstanceItemSubmissionRemarksSchema.parse(req.body)
        const submission = await checklistInstanceItemSubmissionService.updateRemarks(req.params.id, input.remarks, req.user!)
        res.json({ success: true, data: submission })
    }),
}
