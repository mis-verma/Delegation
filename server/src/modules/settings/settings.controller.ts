import { type Request, type Response } from "express";
import { settingsService } from "./settings.service.js";
import { updateSettingsSchema } from "./settings.validation.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../utils/AppError.js";
import { env } from "../../config/env.js";

const ADMIN_ONLY_SETTINGS = [
    "requireAdminLoginCode",
    "accessTokenExpiresMinutes",
    "refreshTokenExpiresDays",
    "auditRetentionDays",
    "checklistAuditRetentionDays",
    "notificationRetentionDays",
    "inboundMessageRetentionDays",
    "maxUploadSizeMb",
    "maxUploadFiles",
    "allowedImageTypes",
] as const

export const settingsController = {
    

    get : asyncHandler(async (_req : Request , res : Response) => {
        const settings = await settingsService.get()
        res.json({ success : true , data : { ...settings, emailConfigured : !!env.SMTP_HOST }})
    }),

    status : asyncHandler(async (_req : Request , res : Response) => {
        const settings = await settingsService.get()
        res.json({
            success : true,
            data : {
                maintenanceMode: settings!.maintenanceMode,
                maintenanceMessage: settings!.maintenanceMessage,
                orgName: settings!.orgName,
                logoUrl: settings!.logoUrl,
                androidAppUrl: settings!.androidAppUrl,
                iosAppUrl: settings!.iosAppUrl,
                liveOnlyAttachments: settings!.liveOnlyAttachments,
            },
        })
    }),

    update : asyncHandler(async (req : Request , res : Response) => {
        const input = updateSettingsSchema.parse(req.body)
        if (req.user!.role !== "ADMIN") {
            const current = await settingsService.get()
            const changed = ADMIN_ONLY_SETTINGS.filter((key) => input[key] !== undefined && JSON.stringify(input[key]) !== JSON.stringify(current?.[key]))
            if (changed.length) throw AppError.forbidden("Only an admin can change sign-in security, token lifetimes, data retention and upload limits.")
        }
        const settings = await settingsService.update(input, req.user!.sub)
        res.json({ success : true, data : settings})
    }),

    uploadLogo : asyncHandler(async (req : Request , res : Response) => {
        if (!req.file) throw AppError.badRequest('No image file provided');
        const url = `/uploads/logos/${req.file.filename}`;
        const settings = await settingsService.updateLogo(url, req.user!.sub);
        res.json({ success : true, data : settings });
    }),

    removeLogo : asyncHandler(async (req : Request , res : Response) => {
        const settings = await settingsService.removeLogo(req.user!.sub);
        res.json({ success : true, data : settings });
    }),
}

