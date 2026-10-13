import { Router } from "express"
import { authenticate } from "../../middleware/auth/auth.js"
import { scoreController } from "./score.controller.js"

export const scoreRouter = Router()

scoreRouter.use(authenticate)
// Any signed-in user. The service decides whose scores they may open.
scoreRouter.get("/", scoreController.scores)
// The table behind the export: every department and person the viewer may see. The service gates the role.
scoreRouter.get("/report", scoreController.report)
// Store, department and employee counts for the Overview's organisation tiles (Admin and PC; the service gates the role).
scoreRouter.get("/org-counts", scoreController.orgCounts)
// One call for every way of cutting the scores (department, store, person, checklist, module). ADMIN/PC org, MANAGER/SENIOR department, others 403.
scoreRouter.get("/explorer", scoreController.explorer)
// Proves the cuts add up (ADMIN/PC only; the controller gates the role).
scoreRouter.get("/data-check", scoreController.dataCheck)
// The same scores over time (a few buckets), for the Trend view. Same access rules as the card.
scoreRouter.get("/trend", scoreController.trend)
