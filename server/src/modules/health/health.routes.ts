import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { healthController } from "./health.controller.js"

// Mounted at /system-health in app.ts (the public liveness/readiness probes live at /health). The
// snapshot shows server internals, so it is admin-only.
export const systemHealthRouter = Router()
systemHealthRouter.use(authenticate, requireRole("ADMIN"))
systemHealthRouter.get("/", healthController.snapshot)
