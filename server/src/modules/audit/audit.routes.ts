import { Router } from "express"
import { auditController } from "./audit.controller.js"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"

export const auditRouter = Router()

auditRouter.use(authenticate , requireRole("ADMIN", "PC"))
auditRouter.get("/", auditController.list)