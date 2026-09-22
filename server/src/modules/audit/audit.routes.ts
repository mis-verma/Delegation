import { Router } from "express" // Express's Router lets us group related endpoints together
import { auditController } from "./audit.controller.js" // the controller functions that handle each route
import { authenticate, requireRole } from "../../middleware/auth/auth.js" // middleware: authenticate checks the user is logged in, requireRole checks their role

export const auditRouter = Router() // create a mini router just for audit-related endpoints

// Every route below requires the user to be logged in (authenticate) AND to have the "ADMIN" role (requireRole).
// This makes sense because audit logs can contain sensitive before/after data about any record in the system,
// so only admins should be able to view them.
auditRouter.use(authenticate , requireRole("ADMIN", "PC"))
// GET /  -> paginated audit log list; entityType/entityId/actorId/action/from/to are all
// optional query-string filters, any combination (or none, for "everything").
auditRouter.get("/", auditController.list)