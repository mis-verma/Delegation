import { type Request, type Response } from "express"
import { z } from "zod"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { scoreService } from "./score.service.js"

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-01")
const querySchema = z
    .object({
        scope: z.enum(["person", "department", "store"]).default("person"),
        // Left out for a person, it means the caller's own scores.
        id: z.string().min(1).max(191).optional(),
        from: DATE,
        to: DATE,
    })
    .refine((q) => q.from <= q.to, "From must be on or before To")
    .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 366 * 86_400_000, "Pick at most one year")
    .refine((q) => q.scope === "person" || !!q.id, "Pick a department or store")

export const scoreController = {
    scores: asyncHandler(async (req: Request, res: Response) => {
        const { scope, id, from, to } = querySchema.parse(req.query)
        const data = await scoreService.forScope(req.user!, scope, id ?? req.user!.sub, from, to)
        res.json({ success: true, data })
    }),
}
