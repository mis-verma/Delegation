import type { Request , Response } from "express" // Express types for the incoming request and outgoing response objects
import { auditService } from "./audit.service.js" // the service layer that actually talks to the database for audit logs
import { auditListQuerySchema } from "./audit.validation.js" // the zod schema we use to validate/parse query params
import { asyncHandler } from "../../utils/asyncHandler.js" // wraps async route handlers so thrown errors are passed to Express's error handling instead of crashing the server

// The audit controller exposes the HTTP-facing functions for reading audit history.
// Audit logs are a compliance/history trail: every time something important changes (a ticket, a user, etc.)
// we record a "before" and "after" snapshot plus who did it (actorId). This lets admins answer
// "who changed this record, and what did it look like before?" - useful for accountability and debugging.
export const auditController = {
    // GET handler for audit log entries — with no filters, this is the admin-wide Audit Log
    // browser; with entityType+entityId, it narrows to one record's full history.
    list : asyncHandler(async (req : Request , res : Response) => {
        const filters = auditListQuerySchema.parse(req.query);
        const result = await auditService.list(filters)
        res.json({ success : true , ...result })
    })
}