import { z } from "zod"
import { summaryQuerySchema } from "../checklistInstances/checklistInstance.validation.js"
import { WORK_KINDS, WORK_METRICS } from "./workMetric.js"

export const dashboardSummariesQuerySchema = z.object({
    scope: z.enum(["mine", "visible"]).default("mine"),
    today: summaryQuerySchema.shape.from,
})

export type DashboardSummariesQuery = z.infer<typeof dashboardSummariesQuerySchema>

export const workItemsQuerySchema = z.object({
    metric: z.enum(WORK_METRICS).default("pending"),
    scope: z.enum(["mine", "visible"]).default("mine"),
    today: summaryQuerySchema.shape.from,
    kinds: z.string().optional().transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [...WORK_KINDS])).pipe(z.array(z.enum(WORK_KINDS)).min(1)),
})
