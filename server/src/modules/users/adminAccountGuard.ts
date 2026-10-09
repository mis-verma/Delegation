import type { NextFunction, Request, Response } from "express"
import { inArray, eq } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/core.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { AppError } from "../../utils/AppError.js"

const MESSAGE = "Only an admin can create or change admin accounts."

/**
 * A PC runs people and teams, but an ADMIN account is above that: PC cannot create one, promote anyone
 * to it, or edit, reset, deactivate, offboard, delete or change the photo of one that exists. ADMIN is
 * never held back. Put it on every write route of the users router (it reads `:id` from the route, so it
 * has to sit on the route itself, not on the router).
 */
export const protectAdminAccounts = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== "PC") return next()

    const body = (req.body ?? {}) as { role?: unknown; ids?: unknown }
    // Creating a user as ADMIN, or promoting someone to it.
    if (body.role === "ADMIN") throw AppError.forbidden(MESSAGE)

    // A bulk change that includes an ADMIN.
    if (Array.isArray(body.ids)) {
        const ids = body.ids.filter((id): id is string => typeof id === "string")
        if (ids.length) {
            const rows = await db.select({ role: users.role }).from(users).where(inArray(users.id, ids))
            if (rows.some((r) => r.role === "ADMIN")) throw AppError.forbidden(MESSAGE)
        }
    }

    // One person by the id in the path.
    const targetId = req.params.id
    if (targetId) {
        const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, targetId)).limit(1)
        if (target?.role === "ADMIN") throw AppError.forbidden(MESSAGE)
    }
    next()
})
