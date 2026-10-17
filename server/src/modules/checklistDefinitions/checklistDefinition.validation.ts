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

// storeIds/assigneeIds/reviewerIds/auditUserIds each back a junction table with a unique
// (definitionId/itemId, userId) index — a duplicate id in the payload (e.g. a double-click on a
// multi-select, or a stale id re-added by a client bug) would otherwise reach the insert and trip
// that constraint, surfacing as an unhandled 500 instead of just being silently deduped like a
// normal "already selected" no-op. Capped well above any real org's headcount so a hostile payload
// can't force one insert of thousands of rows inside the single all-or-nothing transaction.
const dedupedIdArray = z.array(z.string().min(1)).max(500, "Too many ids").transform((ids) => [...new Set(ids)])
const uniqueIdArray = (message: string) => dedupedIdArray.pipe(z.array(z.string()).min(1, message))

// AUDIT only: one tick-list per dress type (key = DressType id). Each entry is trimmed, blank ones
// dropped and repeats removed; a type left with no entries is dropped altogether (it would fall back
// to the gender list anyway). Empty / missing -> null.
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

// Question types that can carry a good-answer rule, split by which half of the rule they use.
const CHOICE_RULE_TYPES: string[] = ["YES_NO", "PASS_FAIL", "MULTIPLE_CHOICE", "DROPDOWN"]
const RANGE_RULE_TYPES: string[] = ["NUMBER_ENTRY", "RATING"]

const definitionItemShape = z.object({
    // The builder sends back the id of every question it loaded. On an update the service keeps that
    // id (when it really belongs to this checklist) so today's runs stay linked to their question;
    // anything else, and every create, gets a fresh one.
    id: z.string().min(1).max(191).optional(),
    // 191 = the varchar length of every one of these columns; longer used to reach the DB and 500.
    label: z.string().trim().min(1).max(191),
    order: z.number().int().min(0).optional(),
    // An empty string is treated the same as "no section" (null) rather than rejected — a bulk
    // import or future plain-text section input could plausibly send '' for "cleared".
    section: z.string().trim().max(120).nullable().optional().transform((v) => (v === '' ? null : v)),
    requiredImageCount: z.number().int().min(0).optional(),
    maxImageCount: z.number().int().min(0).nullable().optional(),
    requiresLivePhoto: z.boolean().optional(),
    isCritical: z.boolean().optional(),
    itemType: z.enum(CHECKLIST_ITEM_TYPES).optional(),
    auditUserIds: dedupedIdArray.optional(),
    // Nullable: a stored AUDIT item with no accessories comes back as null, and the builder sends
    // it straight back on save — rejecting null made every such checklist impossible to re-save.
    accessories: z.array(z.string().min(1)).nullable().optional().transform((v) => v ?? undefined),
    // AUDIT only: a separate list for female / male people (empty or missing = use `accessories`).
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
    // A good-answer rule left over from a type the question no longer has (or never could have) is
    // dropped rather than rejected, so an older client that still sends it keeps working. Choice
    // types keep only the answer list, number/rating only the min/max range, every other type none.
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
    // A minimum above the maximum can never be met (uploads stop at the max), so the item could
    // never be completed.
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
    // The good-answer rule has to be something an answer can actually match, otherwise the question
    // could never score as good.
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
    // 191 = the varchar length of ChecklistDefinition.name. Longer used to reach the DB and 500.
    name: z.string().trim().min(1, "Give the checklist a name").max(191, "Keep the name under 192 characters"),
    // The column is TEXT (65,535 bytes). 16,000 characters stays under that even at 4 bytes each.
    description: z.string().max(16000, "Keep the description under 16,000 characters").optional(),
    storeIds: uniqueIdArray("At least one store is required"),
    recurrence: z.enum(CHECKLIST_RECURRENCES),
    startDate: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Start date isn't a valid date"),
    opensTime: timeOfDay.optional(),
    cutoffTime: timeOfDay.optional(),
    assigneeIds: dedupedIdArray,
    // Additive on top of the role-based verify rule (ADMIN/PC always, MANAGER/HOD scoped to their
    // own department) — naming someone here lets them approve/reject regardless of role/department.
    reviewerIds: dedupedIdArray.optional(),
    assigneeRoles: z.array(z.enum(CHECKLIST_ASSIGNEE_ROLES)).optional(),
    icon: z.enum(CHECKLIST_ICONS).optional(),
    responseMode: z.enum(CHECKLIST_RESPONSE_MODES).optional(),
    // DAILY only (ignored otherwise): 0 = Sunday … 6 = Saturday. Null/omitted = every day.
    activeWeekdays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one working day").max(7)
        .transform((d) => [...new Set(d)].sort()).nullable().optional(),
    // Each item is its own insert inside one all-or-nothing transaction — capped so a runaway
    // payload can't turn an admin-reachable endpoint into an expensive, slow write.
    items: z.array(definitionItemShape).min(1, "At least one checklist item is required").max(200, "A checklist can have at most 200 items"),
}

export const createChecklistDefinitionSchema = z.object(checklistDefinitionFields)

// Same shape as create — Builder's edit mode replaces name/schedule/items wholesale rather than
// patching individual fields, so there's no partial-update variant to maintain separately. The one
// addition, `version`, is what makes this a safe full replace: the client sends back whichever
// version it loaded the checklist at, and the service rejects the write if that no longer matches
// the current row — see checklistDefinition.service.ts's update() — instead of two admins editing
// concurrently silently overwriting each other with no warning.
export const updateChecklistDefinitionSchema = z.object({
    ...checklistDefinitionFields,
    version: z.number().int().min(1),
})

export const setChecklistDefinitionActiveSchema = z.object({
    isActive: z.boolean(),
})

// Same page/limit convention as listChecklistInstancesQuerySchema — list() used to be unbounded,
// hydrating every matching definition (items, stores, assignees, reviewers) on every call.
// `max(200)` mirrors the service-side cap so a caller can't reintroduce that by hand.
export const listChecklistDefinitionsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
})

export type CreateChecklistDefinitionInput = z.infer<typeof createChecklistDefinitionSchema>
export type UpdateChecklistDefinitionInput = z.infer<typeof updateChecklistDefinitionSchema>
export type SetChecklistDefinitionActiveInput = z.infer<typeof setChecklistDefinitionActiveSchema>
