import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { checklistReportController } from "./checklistReport.controller.js"

// Mounted at /checklist-reports in app.ts. ADMIN/PC see every store and department; MANAGER/SENIOR
// are forced to their own department inside the service. Everyone else is turned away here.
export const checklistReportRouter = Router()

checklistReportRouter.use(authenticate)
checklistReportRouter.use(requireRole("ADMIN", "PC", "MANAGER", "SENIOR"))

checklistReportRouter.get("/people", checklistReportController.preview)
checklistReportRouter.get("/export", checklistReportController.export)
