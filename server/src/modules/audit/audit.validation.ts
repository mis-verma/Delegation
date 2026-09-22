import { z } from "zod"; // zod is a schema validation library - lets us define what shape/type incoming data should have, and validate it at runtime
import { objectId } from "../../utils/index.js"

// Every filter is optional so the same endpoint serves both a narrow "history for this one
// ticket" call and the admin-wide Audit Log browser (entityType/entityId/actorId/action/date
// range, any combination, or none of them for "everything"). Replaces the old
// auditQuerySchema (entityType+entityId both required) — nothing on the client called that
// endpoint yet, so there was no contract to preserve.
export const auditListQuerySchema = z.object({
    entityType: z.string().min(1).optional(),
    entityId: objectId.optional(),
    actorId: objectId.optional(),
    action: z.string().min(1).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
})