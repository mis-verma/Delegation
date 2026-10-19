import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { checklistReportController } from "./checklistReport.controller.js"

export const checklistReportRouter = Router()

checklistReportRouter.use(authenticate)
checklistReportRouter.use(requireRole("ADMIN", "PC", "MANAGER", "SENIOR"))

checklistReportRouter.get("/people", checklistReportController.preview)
checklistReportRouter.get("/export", checklistReportController.export)
