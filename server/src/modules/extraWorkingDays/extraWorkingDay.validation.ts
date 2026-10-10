import { z } from "zod"
import { EXTRA_WORKING_DAY_SCOPES } from "../../db/schema/core.js"

// A calendar day as YYYY-MM-DD, checked for real (2026-02-31 passes a plain regex and isn't a day).
const calendarDay = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-11")
    .refine((value) => {
        const parsed = new Date(`${value}T00:00:00.000Z`)
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    }, "That isn't a real date")

export const createExtraWorkingDaySchema = z.object({
    date: calendarDay,
    reason: z.string().trim().min(1, "Say why people are working that day").max(100),
    scope: z.enum(EXTRA_WORKING_DAY_SCOPES),
    // Department, store or person ids, depending on scope. Empty for ALL.
    targetIds: z.array(z.string().min(1).max(191)).max(500).default([]),
}).refine((v) => v.scope === "ALL" || v.targetIds.length > 0, { message: "Pick who is working", path: ["targetIds"] })

export const listExtraWorkingDaysQuerySchema = z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
})

export type CreateExtraWorkingDayInput = z.infer<typeof createExtraWorkingDaySchema>
