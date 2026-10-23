import type { NextFunction, Request, Response } from "express"
import { inArray, eq } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/core.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { AppError } from "../../utils/AppError.js"

const MESSAGE = "Only an admin can create or change admin and owner accounts."

const isProtectedRole = (role: unknown) => role === "ADMIN" || role === "OWNER"

export const protectAdminAccounts = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== "PC") return next()

    const body = (req.body ?? {}) as { role?: unknown; ids?: unknown }
    if (isProtectedRole(body.role)) throw AppError.forbidden(MESSAGE)

    if (Array.isArray(body.ids)) {
        const ids = body.ids.filter((id): id is string => typeof id === "string")
        if (ids.length) {
            const rows = await db.select({ role: users.role }).from(users).where(inArray(users.id, ids))
            if (rows.some((r) => isProtectedRole(r.role))) throw AppError.forbidden(MESSAGE)
        }
    }

    const targetId = req.params.id
    if (targetId) {
        const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, targetId)).limit(1)
        if (isProtectedRole(target?.role)) throw AppError.forbidden(MESSAGE)
    }
    next()
})
