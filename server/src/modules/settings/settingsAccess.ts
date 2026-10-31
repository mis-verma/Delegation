import type { NextFunction, Request, Response } from "express"
import { AppError } from "../../utils/AppError.js"

export const ADMIN_ONLY_SETTINGS = [
    "maintenanceMode",
    "maintenanceMessage",
    "maxUploadSizeMb",
    "maxUploadFiles",
    "allowedImageTypes",
    "liveOnlyAttachments",
    "requireAdminLoginCode",
    "accessTokenExpiresMinutes",
    "refreshTokenExpiresDays",
    "auditRetentionDays",
    "checklistAuditRetentionDays",
    "notificationRetentionDays",
    "inboundMessageRetentionDays",
] as const

export const adminOnlySettingsIn = (body: unknown): string[] => {
    if (!body || typeof body !== "object") return []
    const sent = body as Record<string, unknown>
    return ADMIN_ONLY_SETTINGS.filter((key) => sent[key] !== undefined)
}

export const limitPcSettings = (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role === "PC" && adminOnlySettingsIn(req.body).length > 0) {
        return next(AppError.forbidden("Only an admin can change system, security and retention settings."))
    }
    next()
}
