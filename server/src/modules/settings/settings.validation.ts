import { z } from "zod"
import { tatHoursSchema } from "../../utils/tatLimits.js"

export const updateSettingsSchema = z.object({
    defaultTatHours : tatHoursSchema.optional(),
    maxUploadSizeMb : z.number().positive().optional(),
    maxUploadFiles : z.number().int().positive().optional(),
    allowedImageTypes : z.array(z.string().min(1)).optional(),
    maintenanceMode : z.boolean().optional(),
    maintenanceMessage : z.string().max(500).nullable().optional(),
    notifyTaskDeadlineReminders : z.boolean().optional(),
    notifyChecklistOverdueReminders : z.boolean().optional(),
    liveOnlyAttachments : z.boolean().optional(),
    requireAdminLoginCode : z.boolean().optional(),
    accessTokenExpiresMinutes : z.number().int().min(1).max(1440).optional(),
    refreshTokenExpiresDays : z.number().int().min(1).max(365).optional(),
    orgName : z.string().trim().min(1, "Organization name can't be empty").max(191).optional(),
    androidAppUrl : z.string().trim().url("Paste a full link starting with https://").startsWith("https://", "Paste a full link starting with https://").max(500).nullable().optional(),
    iosAppUrl : z.string().trim().url("Paste a full link starting with https://").startsWith("https://", "Paste a full link starting with https://").max(500).nullable().optional(),
    auditRetentionDays : z.number().int().min(0).max(3650).optional(),
    checklistAuditRetentionDays : z.number().int().min(0).max(3650).optional(),
    notificationRetentionDays : z.number().int().min(0).max(3650).optional(),
    inboundMessageRetentionDays : z.number().int().min(0).max(3650).optional(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>