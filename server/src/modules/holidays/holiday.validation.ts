import { z } from "zod"

const calendarDay = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-02")
    .refine((value) => {
        const parsed = new Date(`${value}T00:00:00.000Z`)
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    }, "That isn't a real date")

export const createHolidaySchema = z.object({
    date: calendarDay,
    name: z.string().trim().min(1, "Give the holiday a name").max(100),
})

export const createHolidaysSchema = z.object({
    holidays: z.array(createHolidaySchema).min(1).max(60),
})

export const previewHolidayQuerySchema = z.object({ date: calendarDay })

export const listHolidaysQuerySchema = z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
})

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>
