import { Router } from "express"
import { auditController } from "./audit.controller.js"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { limitAuditRead } from "./auditAccess.js"

export const auditRouter = Router()

auditRouter.use(authenticate , requireRole("ADMIN", "PC"), limitAuditRead)
auditRouter.get("/", auditController.list)