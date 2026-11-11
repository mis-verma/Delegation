import { Router } from "express"
import { authenticate } from "../../middleware/auth/auth.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { dashboardService } from "./dashboard.service.js"
import { dashboardSummariesQuerySchema } from "./dashboard.validation.js"
import { myApprovals } from "./myApprovals.js"

export const dashboardRouter = Router()
dashboardRouter.use(authenticate)

dashboardRouter.get("/summaries", asyncHandler(async (req, res) => {
    const query = dashboardSummariesQuerySchema.parse(req.query)
    const data = await dashboardService.summaries(req.user!, query)
    res.json({ success: true, data })
}))

dashboardRouter.get("/my-approvals", asyncHandler(async (req, res) => {
    res.json({ success: true, data: await myApprovals(req.user!) })
}))
