import { Router, type Request, type Response } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"
import { approvalCoverService } from "./approvalCover.service.js"
import { createApprovalCoverSchema } from "./approvalCover.validation.js"

export const approvalCoverRouter = Router()

approvalCoverRouter.use(authenticate, requireRole("ADMIN", "PC", "MANAGER", "SENIOR"))

approvalCoverRouter.get("/", asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await approvalCoverService.listFor(req.user!.sub) })
}))

approvalCoverRouter.get("/people", asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await approvalCoverService.people(req.user!) })
}))

approvalCoverRouter.post("/", asyncHandler(async (req: Request, res: Response) => {
    const input = createApprovalCoverSchema.parse(req.body)
    res.status(201).json({ success: true, data: await approvalCoverService.create(input, req.user!) })
}))

approvalCoverRouter.delete("/:id", asyncHandler(async (req: Request, res: Response) => {
    await approvalCoverService.revoke(routeParam(req, "id"), req.user!)
    res.json({ success: true })
}))
