import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { healthController } from "./health.controller.js"

export const systemHealthRouter = Router()
systemHealthRouter.use(authenticate, requireRole("ADMIN"))
systemHealthRouter.get("/", healthController.snapshot)
