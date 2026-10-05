import { z } from "zod"
import { CAPTURE_METHODS } from "../../db/schema/task.js"

export const setChecklistInstanceItemSubmissionDoneSchema = z.object({
    isDone: z.boolean(),
    // "This person can't be checked today": counts as submitted, needs a reason (remarks).
    notApplicable: z.boolean().optional(),
    remarks: z.string().trim().max(2000).optional(),
})

export const updateChecklistInstanceItemSubmissionAccessoriesSchema = z.object({
    accessories: z.array(z.object({ name: z.string().min(1), checked: z.boolean() })),
})

export const setChecklistInstanceItemSubmissionDressTypeSchema = z.object({
    // null = "Standard": the person's gender list, then the question's main list.
    dressTypeId: z.string().min(1).max(191).nullable(),
})

export const updateChecklistInstanceItemSubmissionRemarksSchema = z.object({
    remarks: z.string().max(2000).nullable(),
})

// Same idea as checklistInstanceImages/checklistInstance.validation.ts's upload schema — the
// files themselves are validated by multer (config/upload.ts's
// checklistInstanceItemSubmissionImageUpload), this just validates the capture-method metadata
// riding alongside them.
export const uploadChecklistInstanceItemSubmissionImageSchema = z.object({
    captureMethod: z.enum(CAPTURE_METHODS),
})

export type SetChecklistInstanceItemSubmissionDoneInput = z.infer<typeof setChecklistInstanceItemSubmissionDoneSchema>
export type UpdateChecklistInstanceItemSubmissionAccessoriesInput = z.infer<typeof updateChecklistInstanceItemSubmissionAccessoriesSchema>
export type UpdateChecklistInstanceItemSubmissionRemarksInput = z.infer<typeof updateChecklistInstanceItemSubmissionRemarksSchema>
export type UploadChecklistInstanceItemSubmissionImageInput = z.infer<typeof uploadChecklistInstanceItemSubmissionImageSchema>
