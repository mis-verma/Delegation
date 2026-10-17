import { z } from "zod"
import { DRAFT_KINDS } from "../../db/schema/core.js"

const MAX_PAYLOAD_CHARS = 200_000

const payloadSchema = z.record(z.string(), z.unknown()).refine(
    (v) => JSON.stringify(v).length <= MAX_PAYLOAD_CHARS,
    { message: "This draft is too big to save." },
)

export const listDraftsQuerySchema = z.object({
    kind: z.enum(DRAFT_KINDS).optional(),
})

export const createDraftSchema = z.object({
    kind: z.enum(DRAFT_KINDS),
    title: z.string().trim().max(191).optional(),
    payload: payloadSchema,
})

export const updateDraftSchema = z.object({
    title: z.string().trim().max(191).optional(),
    payload: payloadSchema.optional(),
})

export type CreateDraftInput = z.infer<typeof createDraftSchema>
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>
export type DraftKind = (typeof DRAFT_KINDS)[number]
