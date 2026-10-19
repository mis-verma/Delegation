import { z } from "zod"
import {
    CHECKLIST_RECURRENCES,
    CHECKLIST_ASSIGNEE_ROLES,
    CHECKLIST_RESPONSE_MODES,
    CHECKLIST_ICONS,
    CHECKLIST_ITEM_TYPES,
    CHECKLIST_CONDITIONAL_ACTIONS,
    YES_NO_VALUES,
} from "../../db/schema/checklistDefinition.js"

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Expected HH:mm")

const dedupedIdArray = z.array(z.string().min(1)).max(500, "Too many ids").transform((ids) => [...new Set(ids)])
const uniqueIdArray = (message: string) => dedupedIdArray.pipe(z.array(z.string()).min(1, message))

const accessoryName = z.string().max(191, "Keep each item under 192 characters").transform((v) => v.trim())
const accessoriesByTypeSchema = z
    .record(
        z.string().min(1).max(191),
        z.array(accessoryName).max(40, "At most 40 items per dress type").transform((names) => [...new Set(names.filter((n) => n !== ""))]),
    )
    .refine((m) => Object.keys(m).length <= 12, "At most 12 dress types per question")
    .transform((m) => {
        const kept = Object.entries(m).filter(([, names]) => names.length > 0)
        return kept.length ? Object.fromEntries(kept) : null
    })

const CHOICE_RULE_TYPES: string[] = ["YES_NO", "PASS_FAIL", "MULTIPLE_CHOICE", "DROPDOWN"]
const RANGE_RULE_TYPES: string[] = ["NUMBER_ENTRY", "RATING"]

const definitionItemShape = z.object({
    id: z.string().min(1).max(191).optional(),
    label: z.string().trim().min(1).max(191),
    order: z.number().int().min(0).optional(),
    section: z.string().trim().max(120).nullable().optional().transform((v) => (v === '' ? null : v)),
    requiredImageCount: z.number().int().min(0).optional(),
    maxImageCount: z.number().int().min(0).nullable().optional(),
    requiresLivePhoto: z.boolean().optional(),
    isCritical: z.boolean().optional(),
    itemType: z.enum(CHECKLIST_ITEM_TYPES).optional(),
    auditUserIds: dedupedIdArray.optional(),
    accessories: z.array(z.string().min(1)).nullable().optional().transform((v) => v ?? undefined),
    accessoriesFemale: z.array(z.string().min(1)).nullable().optional().transform((v) => v ?? undefined),
    accessoriesMale: z.array(z.string().min(1)).nullable().optional().transform((v) => v ?? undefined),
    accessoriesByType: accessoriesByTypeSchema.nullable().optional().transform((v) => v ?? undefined),
    numberEntryUnit: z.string().trim().min(1).max(191).nullable().optional(),
    numberEntryMin: z.number().nullable().optional(),
    numberEntryMax: z.number().nullable().optional(),
    ratingScale: z.number().int().min(2).max(10).nullable().optional(),
    options: z.array(z.string().min(1)).optional(),
    gpsTargetLat: z.number().min(-90).max(90).nullable().optional(),
    gpsTargetLng: z.number().min(-180).max(180).nullable().optional(),
    gpsRadiusMeters: z.number().min(1).nullable().optional(),
    signatureLabels: z.array(z.string().min(1)).optional(),
    qrExpectedValue: z.string().trim().min(1).max(191).nullable().optional(),
    cashExpectedAmount: z.number().min(0).nullable().optional(),
    acceptableAnswers: z.array(z.string().min(1)).nullable().optional(),
    acceptableMin: z.number().nullable().optional(),
    acceptableMax: z.number().nullable().optional(),
    yesActions: z.array(z.enum(CHECKLIST_CONDITIONAL_ACTIONS)).optional(),
    noActions: z.array(z.enum(CHECKLIST_CONDITIONAL_ACTIONS)).optional(),
}).transform((item) => {
    const type = item.itemType ?? ""
    return {
        ...item,
        acceptableAnswers: CHOICE_RULE_TYPES.includes(type) ? item.acceptableAnswers : null,
        acceptableMin: RANGE_RULE_TYPES.includes(type) ? item.acceptableMin : null,
        acceptableMax: RANGE_RULE_TYPES.includes(type) ? item.acceptableMax : null,
    }
}).refine(item => item.itemType !== "AUDIT" || (item.auditUserIds?.length ?? 0) >= 1, {
    message: "At least one auditor is required for an audit item",
    path: ["auditUserIds"],
}).refine(item => item.maxImageCount == null || (item.requiredImageCount ?? 0) <= item.maxImageCount, {
    message: "Minimum photos can't be more than the maximum",
    path: ["maxImageCount"],
}).refine(item => item.numberEntryMin == null || item.numberEntryMax == null || item.numberEntryMin <= item.numberEntryMax, {
    message: "Minimum must be less than or equal to maximum",
    path: ["numberEntryMax"],
}).refine(item => !["MULTIPLE_CHOICE", "DROPDOWN"].includes(item.itemType ?? "") || (item.options?.length ?? 0) >= 2, {
    message: "At least two options are required",
    path: ["options"],
}).refine(item => item.gpsRadiusMeters == null || (item.gpsTargetLat != null && item.gpsTargetLng != null), {
    message: "A target location is required when a radius is set",
    path: ["gpsRadiusMeters"],
}).refine(item => item.itemType !== "VIDEO_UPLOAD" || (item.requiredImageCount ?? 0) >= 1, {
    message : "At least one video is required for a video upload item",
    path : ["requiredImageCount"],
}).refine(item => (!item.yesActions?.length && !item.noActions?.length) || ["YES_NO", "PASS_FAIL"].includes(item.itemType ?? ""), {
    message: "Conditional rules only apply to Yes/No or Pass/Fail items",
    path: ["yesActions"],
}).superRefine((item, ctx) => {
    const type = item.itemType ?? ""
    const answers = item.acceptableAnswers ?? []
    const { acceptableMin: min, acceptableMax: max } = item

    if (type === "YES_NO" || type === "PASS_FAIL") {
        if (answers.some((a) => !(YES_NO_VALUES as readonly string[]).includes(a))) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptableAnswers"], message: "The good answer must be Yes or No" })
        }
    } else if (type === "MULTIPLE_CHOICE" || type === "DROPDOWN") {
        const options = item.options ?? []
        const bad = answers.filter((a) => !options.includes(a))
        if (bad.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["acceptableAnswers"],
                message: `Good answer ${bad.map((b) => `"${b}"`).join(", ")} is not one of the options`,
            })
        }
    }

    if (!RANGE_RULE_TYPES.includes(type)) return
    if (min != null && max != null && min > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptableMax"], message: "Good answer minimum can't be more than the maximum" })
        return
    }
    const outside = (lo: number, hi: number) => (min != null && (min < lo || min > hi)) || (max != null && (max < lo || max > hi))
    if (type === "RATING" && item.ratingScale != null && outside(1, item.ratingScale)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptableMax"], message: `Good answer range must be between 1 and ${item.ratingScale}` })
    }
    if (type === "NUMBER_ENTRY" && item.numberEntryMin != null && item.numberEntryMax != null && outside(item.numberEntryMin, item.numberEntryMax)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["acceptableMax"],
            message: `Good answer range must be between ${item.numberEntryMin} and ${item.numberEntryMax}`,
        })
    }
})

const checklistDefinitionFields = {
    name: z.string().trim().min(1, "Give the checklist a name").max(191, "Keep the name under 192 characters"),
    description: z.string().max(16000, "Keep the description under 16,000 characters").optional(),
    storeIds: uniqueIdArray("At least one store is required"),
    recurrence: z.enum(CHECKLIST_RECURRENCES),
    startDate: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Start date isn't a valid date"),
    opensTime: timeOfDay.optional(),
    cutoffTime: timeOfDay.optional(),
    assigneeIds: dedupedIdArray,
    reviewerIds: dedupedIdArray.optional(),
    assigneeRoles: z.array(z.enum(CHECKLIST_ASSIGNEE_ROLES)).optional(),
    icon: z.enum(CHECKLIST_ICONS).optional(),
    responseMode: z.enum(CHECKLIST_RESPONSE_MODES).optional(),
    activeWeekdays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one working day").max(7)
        .transform((d) => [...new Set(d)].sort()).nullable().optional(),
    items: z.array(definitionItemShape).min(1, "At least one checklist item is required").max(200, "A checklist can have at most 200 items"),
}

export const createChecklistDefinitionSchema = z.object(checklistDefinitionFields)

export const updateChecklistDefinitionSchema = z.object({
    ...checklistDefinitionFields,
    version: z.number().int().min(1),
})

export const setChecklistDefinitionActiveSchema = z.object({
    isActive: z.boolean(),
})

export const listChecklistDefinitionsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
})

export type CreateChecklistDefinitionInput = z.infer<typeof createChecklistDefinitionSchema>
export type UpdateChecklistDefinitionInput = z.infer<typeof updateChecklistDefinitionSchema>
export type SetChecklistDefinitionActiveInput = z.infer<typeof setChecklistDefinitionActiveSchema>
