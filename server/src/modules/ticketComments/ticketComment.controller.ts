import type { Request, Response } from "express"
import { ticketCommentService } from "./ticketComment.service.js"
import { createCommentSchema } from "./ticketComment.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"

export const ticketCommentController = {
    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createCommentSchema.parse(req.body)
        const comment = await ticketCommentService.create(routeParam(req, "ticketId"), input, req.user!)
        res.status(201).json({ success: true, data: comment })
    }),
}
