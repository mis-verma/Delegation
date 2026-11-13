import { Router } from "express"
import { authenticate } from "../../middleware/auth/auth.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"
import { leaveService } from "./leave.service.js"
import { backdateLimitFor } from "./leaveRules.js"
import { createLeaveSchema, decideLeaveSchema, previewLeaveQuerySchema } from "./leave.validation.js"

export const leaveRouter = Router()
leaveRouter.use(authenticate)

leaveRouter.get("/", asyncHandler(async (req, res) => {
    res.json({ success: true, data: await leaveService.list(req.user!) })
}))

leaveRouter.get("/rules", (req, res) => {
    res.json({ success: true, data: { backdateDays: backdateLimitFor(req.user!.role) } })
})

leaveRouter.get("/preview", asyncHandler(async (req, res) => {
    const { userId, startDate, endDate } = previewLeaveQuerySchema.parse(req.query)
    res.json({ success: true, data: await leaveService.preview(req.user!, userId, startDate, endDate) })
}))

leaveRouter.post("/", asyncHandler(async (req, res) => {
    const input = createLeaveSchema.parse(req.body)
    const { leave, status, removedRuns, openTickets, openDelegations } = await leaveService.create(input, req.user!)
    res.status(201).json({ success: true, data: leave, status, removedRuns, openTickets, openDelegations })
}))

leaveRouter.post("/:id/approve", asyncHandler(async (req, res) => {
    res.json({ success: true, data: await leaveService.decide(routeParam(req, "id"), true, undefined, req.user!) })
}))

leaveRouter.post("/:id/decline", asyncHandler(async (req, res) => {
    const { note } = decideLeaveSchema.parse(req.body ?? {})
    res.json({ success: true, data: await leaveService.decide(routeParam(req, "id"), false, note, req.user!) })
}))

leaveRouter.delete("/:id", asyncHandler(async (req, res) => {
    await leaveService.remove(routeParam(req, "id"), req.user!)
    res.json({ success: true })
}))
