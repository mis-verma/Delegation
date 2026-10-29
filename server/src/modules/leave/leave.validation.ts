import { z } from "zod"

const calendarDay = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-02")
    .refine((value) => {
        const parsed = new Date(`${value}T00:00:00.000Z`)
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    }, "That isn't a real date")

export const createLeaveSchema = z.object({
    userId: z.string().min(1).max(191),
    startDate: calendarDay,
    endDate: calendarDay,
    reason: z.string().trim().max(191).optional(),
})

export const previewLeaveQuerySchema = z.object({
    userId: z.string().min(1).max(191),
    startDate: calendarDay,
    endDate: calendarDay,
})

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>
