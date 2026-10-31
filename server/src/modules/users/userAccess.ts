import type { NextFunction, Request, Response } from "express"
import { AppError } from "../../utils/AppError.js"

export const ADMIN_ONLY_USER_FIELDS = ["role", "isActive", "email"] as const

export const adminOnlyUserFieldsIn = (body: unknown): string[] => {
    if (!body || typeof body !== "object") return []
    const sent = body as Record<string, unknown>
    return ADMIN_ONLY_USER_FIELDS.filter((key) => sent[key] !== undefined)
}

export const limitPcUserChanges = (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role === "PC" && adminOnlyUserFieldsIn(req.body).length > 0) {
        return next(AppError.forbidden("Only an admin can change a role, an email or whether someone is active."))
    }
    next()
}
