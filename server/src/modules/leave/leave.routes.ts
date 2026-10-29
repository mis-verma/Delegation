import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"
import { leaveService } from "./leave.service.js"
import { createLeaveSchema, previewLeaveQuerySchema } from "./leave.validation.js"

export const leaveRouter = Router()
leaveRouter.use(authenticate, requireRole("ADMIN", "PC", "MANAGER", "SENIOR"))

leaveRouter.get("/", asyncHandler(async (req, res) => {
    res.json({ success: true, data: await leaveService.list(req.user!) })
}))

leaveRouter.get("/preview", asyncHandler(async (req, res) => {
    const { userId, startDate, endDate } = previewLeaveQuerySchema.parse(req.query)
    res.json({ success: true, data: await leaveService.preview(req.user!, userId, startDate, endDate) })
}))

leaveRouter.post("/", asyncHandler(async (req, res) => {
    const input = createLeaveSchema.parse(req.body)
    const { leave, removedRuns, openTickets, openDelegations } = await leaveService.create(input, req.user!)
    res.status(201).json({ success: true, data: leave, removedRuns, openTickets, openDelegations })
}))

leaveRouter.delete("/:id", asyncHandler(async (req, res) => {
    await leaveService.remove(routeParam(req, "id"), req.user!)
    res.json({ success: true })
}))
