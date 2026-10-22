import { Router } from "express"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { asyncHandler, AppError, objectId } from "../../utils/index.js"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/core.js"
import { auditService } from "../audit/audit.service.js"

const bodySchema = z.object({ userId: objectId })

const loadTarget = async (adminId: string, userId: string) => {
    if (userId === adminId) throw AppError.badRequest("That is your own account. Pick someone else to preview.")
    const [target] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        departmentId: users.departmentId,
        storeId: users.storeId,
    }).from(users).where(eq(users.id, userId)).limit(1)
    if (!target) throw AppError.notFound("That person no longer exists.")
    if (!target.isActive) throw AppError.badRequest("That account is deactivated, so there is nothing to preview.")
    if (target.role === "ADMIN") throw AppError.forbidden("You can't preview another admin's account.")
    return target
}

export const viewAsRouter = Router()

viewAsRouter.use(authenticate, requireRole("ADMIN"))

viewAsRouter.post("/start", asyncHandler(async (req, res) => {
    const { userId } = bodySchema.parse(req.body)
    const target = await loadTarget(req.user!.sub, userId)
    await auditService.record({ entityType: "User", entityId: target.id, action: "VIEW_AS", actorId: req.user!.sub, after: { phase: "start", role: target.role } })
    res.json({ success: true, data: target })
}))

viewAsRouter.post("/end", asyncHandler(async (req, res) => {
    const { userId } = bodySchema.parse(req.body)
    await auditService.record({ entityType: "User", entityId: userId, action: "VIEW_AS", actorId: req.user!.sub, after: { phase: "end" } })
    res.json({ success: true, data: { ended: true } })
}))
