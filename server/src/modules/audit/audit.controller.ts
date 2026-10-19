import type { Request , Response } from "express"
import { auditService } from "./audit.service.js"
import { auditListQuerySchema } from "./audit.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"

export const auditController = {
    list : asyncHandler(async (req : Request , res : Response) => {
        const filters = auditListQuerySchema.parse(req.query);
        const result = await auditService.list(filters)
        res.json({ success : true , ...result })
    })
}