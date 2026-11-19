import { z } from "zod"
import { CHECKLIST_RECURRENCES, CHECKLIST_RESPONSE_MODES } from "../../db/schema/checklistDefinition.js"

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Expected HH:mm")
const dedupedIdArray = z.array(z.string().min(1)).max(500, "Too many ids").transform((ids) => [...new Set(ids)])

export const checklistCreateImportPublishSchema = z.object({
    groups: z.array(z.object({
        name: z.string().trim().min(1, "Every checklist needs a name").max(191, "Keep the name under 192 characters"),
        recurrence: z.enum(CHECKLIST_RECURRENCES),
        storeIds: dedupedIdArray.pipe(z.array(z.string()).min(1, "Pick at least one store")),
        assigneeIds: dedupedIdArray,
        items: z.array(z.object({
            label: z.string().trim().min(1).max(191),
            photoRequired: z.boolean(),
        })).min(1, "Needs at least one question").max(200, "A checklist can have at most 200 items"),
    })).min(1, "Nothing to create").max(100, "At most 100 checklists in one batch"),
    startDate: z.string().optional(),
    opensTime: timeOfDay.optional(),
    cutoffTime: timeOfDay.optional(),
    responseMode: z.enum(CHECKLIST_RESPONSE_MODES).optional(),
})

export type ChecklistCreateImportPublishInput = z.infer<typeof checklistCreateImportPublishSchema>
