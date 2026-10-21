import { z } from "zod"
import { summaryQuerySchema } from "../checklistInstances/checklistInstance.validation.js"

export const dashboardSummariesQuerySchema = z.object({
    scope: z.enum(["mine", "visible"]).default("mine"),
    today: summaryQuerySchema.shape.from,
    readyFrom: summaryQuerySchema.shape.from,
})

export type DashboardSummariesQuery = z.infer<typeof dashboardSummariesQuerySchema>
