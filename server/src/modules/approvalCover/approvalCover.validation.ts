import { z } from "zod"

const instant = z.string().datetime({ offset: true })

export const createApprovalCoverSchema = z.object({
    toUserId: z.string().min(1),
    fromUserId: z.string().min(1).optional(),
    startsAt: instant.optional(),
    endsAt: instant,
    note: z.string().trim().max(191).optional(),
})

export type CreateApprovalCoverInput = z.infer<typeof createApprovalCoverSchema>
