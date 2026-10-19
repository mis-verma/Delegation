import { Router } from "express"
import { authenticate } from "../../middleware/auth/auth.js"
import { scoreController } from "./score.controller.js"

export const scoreRouter = Router()

scoreRouter.use(authenticate)
scoreRouter.get("/", scoreController.scores)
scoreRouter.get("/report", scoreController.report)
scoreRouter.get("/org-counts", scoreController.orgCounts)
scoreRouter.get("/explorer", scoreController.explorer)
scoreRouter.get("/data-check", scoreController.dataCheck)
scoreRouter.get("/trend", scoreController.trend)
