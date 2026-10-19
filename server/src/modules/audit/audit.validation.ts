import { z } from "zod";
import { objectId } from "../../utils/index.js"
import { AUDIT_GROUPS } from "./audit.service.js"

export const auditListQuerySchema = z.object({
    entityType: z.string().min(1).optional(),
    entityId: objectId.optional(),
    actorId: objectId.optional(),
    action: z.string().min(1).optional(),
    group: z.enum(AUDIT_GROUPS).optional(),
    source: z.string().min(1).max(32).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
})