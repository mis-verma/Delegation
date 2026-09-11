import { z } from "zod"

export const updateSettingsSchema = z.object({
    defaultTatHours : z.number().positive().optional(),
    maxUploadSizeMb : z.number().positive().optional(),
    // .positive() (not just .int()) — 0 or a negative value would silently break every upload
    // endpoint app-wide (multer's `files` limit rejects everything), with no server-side guard.
    maxUploadFiles : z.number().int().positive().optional(),
    allowedImageTypes : z.array(z.string().min(1)).optional()
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>