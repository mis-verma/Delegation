import { z } from "zod"
import { EVENT_TYPES } from "../../db/schema/core.js"

export const createEventSchema = z.object({
    title : z.string().min(1),
    description : z.string().optional(),
    type : z.enum(EVENT_TYPES).optional(),
    eventDate : z.string().datetime(),
})

export const updateEventSchema = createEventSchema.partial()

export const listUpcomingEventsQuerySchema = z.object({
    limit : z.coerce.number().int().min(1).max(100).default(5),
})

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
