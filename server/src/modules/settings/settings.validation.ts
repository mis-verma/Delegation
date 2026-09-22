import { z } from "zod"

export const updateSettingsSchema = z.object({
    defaultTatHours : z.number().positive().optional(),
    maxUploadSizeMb : z.number().positive().optional(),
    // .positive() (not just .int()) — 0 or a negative value would silently break every upload
    // endpoint app-wide (multer's `files` limit rejects everything), with no server-side guard.
    maxUploadFiles : z.number().int().positive().optional(),
    allowedImageTypes : z.array(z.string().min(1)).optional(),
    maintenanceMode : z.boolean().optional(),
    maintenanceMessage : z.string().max(500).nullable().optional(),
    notifyTaskDeadlineReminders : z.boolean().optional(),
    notifyChecklistOverdueReminders : z.boolean().optional(),
    // Bounded so a fat-fingered admin value can't lock everyone out (too low) or defeat the point
    // of expiry entirely (too high) — 1 min-1 day for access, 1-365 days for refresh.
    accessTokenExpiresMinutes : z.number().int().min(1).max(1440).optional(),
    refreshTokenExpiresDays : z.number().int().min(1).max(365).optional(),
    orgName : z.string().trim().min(1, "Organization name can't be empty").max(191).optional(),
    // logoUrl is deliberately NOT settable here — it's only ever written by the dedicated
    // upload/remove endpoints below, which control the exact value (a path under /uploads/logos)
    // rather than trusting an arbitrary client-supplied string.
    // 0 = keep forever (matches the retention jobs' own "0 disables the sweep" semantics); capped
    // at ~10 years so a typo can't accidentally mean "unbounded" via an absurdly large number.
    auditRetentionDays : z.number().int().min(0).max(3650).optional(),
    notificationRetentionDays : z.number().int().min(0).max(3650).optional(),
    inboundMessageRetentionDays : z.number().int().min(0).max(3650).optional(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>