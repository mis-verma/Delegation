import { z } from "zod"

export const MAX_TAT_HOURS = 24 * 90

export const tatHoursSchema = z.number().positive().max(MAX_TAT_HOURS)
