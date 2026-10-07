import { Router } from "express"
import { authenticate } from "../../middleware/auth/auth.js"
import { scoreController } from "./score.controller.js"

export const scoreRouter = Router()

scoreRouter.use(authenticate)
// Any signed-in user. The service decides whose scores they may open.
scoreRouter.get("/", scoreController.scores)
// The table behind the export: every department and person the viewer may see. The service gates the role.
scoreRouter.get("/report", scoreController.report)
// The same scores over time (a few buckets), for the Trend view. Same access rules as the card.
scoreRouter.get("/trend", scoreController.trend)
