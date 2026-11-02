import type { NextFunction, Request, Response } from "express"
import { AppError } from "../../utils/AppError.js"

const PC_READABLE_ENTITIES = new Set(["Ticket", "TicketAttachment", "Task", "Project", "ChecklistInstance", "ChecklistInstanceItem", "ChecklistRun"])

export const auditReadAllowed = (role: string | undefined, query: Record<string, unknown>): boolean => {
    if (role === "ADMIN") return true
    return role === "PC"
        && typeof query.entityId === "string" && query.entityId.length > 0
        && typeof query.entityType === "string" && PC_READABLE_ENTITIES.has(query.entityType)
}

export const limitAuditRead = (req: Request, _res: Response, next: NextFunction) => {
    if (auditReadAllowed(req.user?.role, req.query)) return next()
    next(AppError.forbidden("Only an admin can read the full audit log."))
}
