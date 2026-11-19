import { db } from "../../config/db.js"
import { stores, users } from "../../db/schema/index.js"
import { CHECKLIST_RECURRENCES, type ChecklistRecurrence, type ChecklistResponseMode } from "../../db/schema/checklistDefinition.js"
import { AppError } from "../../utils/AppError.js"
import { parseSheetRecords, type SheetRecord } from "../../utils/sheetRows.js"
import { matchExactOrFuzzy, looksLikeEmail, type MatchConfidence } from "../../utils/fuzzyMatch.js"
import { checklistDefinitionService } from "./checklistDefinition.service.js"
import type { CreateChecklistDefinitionInput } from "./checklistDefinition.validation.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"

export type CreateImportRawRow = {
    rowIndex: number
    checklistName: string
    recurrenceText: string
    question: string
    photoRequired: boolean
    personName: string
    storeName: string
}

export type CreateImportMatchedRow = {
    rowIndex: number
    raw: { checklistName: string; recurrenceText: string; question: string; photoRequired: boolean; personName: string; storeName: string }
    recurrence: ChecklistRecurrence | null
    personId: string | null
    personMatchConfidence: MatchConfidence
    storeId: string | null
    storeMatchConfidence: MatchConfidence
}

export type CreateImportGroupPreview = {
    key: string
    checklistName: string
    recurrence: ChecklistRecurrence | null
    rowIndexes: number[]
    items: { label: string; photoRequired: boolean; conflict: boolean }[]
    personIds: string[]
    unmatchedPeople: string[]
    storeIds: string[]
    unmatchedStores: string[]
}

export type CreateImportPreviewResult = {
    rows: CreateImportMatchedRow[]
    groups: CreateImportGroupPreview[]
    stores: { id: string; name: string }[]
    users: { id: string; name: string; email: string }[]
}

export type CreateImportGroupInput = {
    name: string
    recurrence: ChecklistRecurrence
    storeIds: string[]
    assigneeIds: string[]
    items: { label: string; photoRequired: boolean }[]
}

export type CreateImportSchedule = { startDate?: string; opensTime?: string; cutoffTime?: string; responseMode?: ChecklistResponseMode }

export type CreateImportSummary = {
    created: number
    failed: { name: string; message: string }[]
}

const HEADER_ALIASES: Record<string, keyof Omit<CreateImportRawRow, "rowIndex">> = {
    "checklist name": "checklistName",
    "checklist": "checklistName",
    "type": "recurrenceText",
    "recurrence": "recurrenceText",
    "frequency": "recurrenceText",
    "question": "question",
    "task": "question",
    "item": "question",
    "checklist task name": "question",
    "task name": "question",
    "photos required": "photoRequired",
    "photo required": "photoRequired",
    "photo": "photoRequired",
    "photos": "photoRequired",
    "requires photo": "photoRequired",
    "person": "personName",
    "assignee": "personName",
    "assigned to": "personName",
    "email": "personName",
    "user": "personName",
    "users": "personName",
    "store": "storeName",
    "stores": "storeName",
    "location": "storeName",
}

const EMPTY_ITEM_DEFAULTS = {
    section: undefined, maxImageCount: undefined, requiresLivePhoto: undefined, referenceImageUrl: undefined,
    isCritical: undefined, allowNotApplicable: undefined, itemType: undefined, auditUserIds: undefined,
    accessories: undefined, accessoriesFemale: undefined, accessoriesMale: undefined, accessoriesByType: undefined,
    criticalAccessories: undefined, accessoryPoints: undefined, auditPhotoOnlyOnMiss: undefined,
    numberEntryUnit: undefined, numberEntryMin: undefined, numberEntryMax: undefined, ratingScale: undefined,
    options: undefined, gpsTargetLat: undefined, gpsTargetLng: undefined, gpsRadiusMeters: undefined,
    signatureLabels: undefined, qrExpectedValue: undefined, cashExpectedAmount: undefined,
    acceptableAnswers: undefined, acceptableMin: undefined, acceptableMax: undefined,
    yesActions: undefined, noActions: undefined,
} as const

const TRUE_VALUES = new Set(["yes", "y", "true", "1"])
const parsePhotoRequired = (v: string) => TRUE_VALUES.has(v.trim().toLowerCase())

const RECURRENCE_ALIASES: Record<string, ChecklistRecurrence> = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    quarterly: "QUARTERLY",
    yearly: "YEARLY",
    annual: "YEARLY",
    "one time": "ONE_TIME",
    "one-time": "ONE_TIME",
    once: "ONE_TIME",
    "twice weekly": "TWICE_WEEKLY",
    "twice a week": "TWICE_WEEKLY",
    "twice monthly": "TWICE_MONTHLY",
    "twice a month": "TWICE_MONTHLY",
}

export const parseRecurrenceText = (raw: string): ChecklistRecurrence | null => {
    const key = raw.trim().toLowerCase()
    if (!key) return null
    if ((CHECKLIST_RECURRENCES as readonly string[]).includes(key.toUpperCase().replace(/ /g, "_"))) {
        return key.toUpperCase().replace(/ /g, "_") as ChecklistRecurrence
    }
    return RECURRENCE_ALIASES[key] ?? null
}

const buildRowFromRecord = (record: SheetRecord, rowIndex: number): CreateImportRawRow | null => {
    const mapped: Partial<Record<keyof Omit<CreateImportRawRow, "rowIndex">, string>> = {}
    for (const [key, value] of Object.entries(record)) {
        const canonical = HEADER_ALIASES[key.trim().toLowerCase()]
        if (!canonical) continue
        const v = String(value ?? "").trim()
        if (v) mapped[canonical] = v
    }
    if (!mapped.checklistName && !mapped.question && !mapped.personName) return null
    return {
        rowIndex,
        checklistName: mapped.checklistName ?? "",
        recurrenceText: mapped.recurrenceText ?? "",
        question: mapped.question ?? "",
        photoRequired: parsePhotoRequired(mapped.photoRequired ?? ""),
        personName: mapped.personName ?? "",
        storeName: mapped.storeName ?? "",
    }
}

export const groupKeyOf = (checklistName: string, recurrence: ChecklistRecurrence | null): string =>
    `${checklistName.trim().toLowerCase()}::${recurrence ?? ""}`

export const buildGroupPreviews = (rows: CreateImportMatchedRow[]): CreateImportGroupPreview[] => {
    const groups = new Map<string, CreateImportGroupPreview>()
    for (const row of rows) {
        const key = groupKeyOf(row.raw.checklistName, row.recurrence)
        let group = groups.get(key)
        if (!group) {
            group = { key, checklistName: row.raw.checklistName, recurrence: row.recurrence, rowIndexes: [], items: [], personIds: [], unmatchedPeople: [], storeIds: [], unmatchedStores: [] }
            groups.set(key, group)
        }
        group.rowIndexes.push(row.rowIndex)

        if (row.raw.question.trim()) {
            const existingItem = group.items.find((i) => i.label.trim().toLowerCase() === row.raw.question.trim().toLowerCase())
            if (!existingItem) group.items.push({ label: row.raw.question.trim(), photoRequired: row.raw.photoRequired, conflict: false })
            else if (existingItem.photoRequired !== row.raw.photoRequired) existingItem.conflict = true
        }

        if (row.raw.personName.trim()) {
            if (row.personId && !group.personIds.includes(row.personId)) group.personIds.push(row.personId)
            else if (!row.personId && !group.unmatchedPeople.includes(row.raw.personName)) group.unmatchedPeople.push(row.raw.personName)
        }

        if (row.raw.storeName.trim()) {
            if (row.storeId && !group.storeIds.includes(row.storeId)) group.storeIds.push(row.storeId)
            else if (!row.storeId && !group.unmatchedStores.includes(row.raw.storeName)) group.unmatchedStores.push(row.raw.storeName)
        }
    }
    return [...groups.values()]
}

export const checklistCreateImportService = {
    async parseFile(buffer: Buffer, mimetype: string): Promise<{ rows: CreateImportRawRow[]; warnings: string[] }> {
        const { records, warnings } = await parseSheetRecords(buffer, mimetype)
        const rows = records
            .map((r, i) => buildRowFromRecord(r, i + 1))
            .filter((r): r is CreateImportRawRow => r !== null)
        return { rows, warnings }
    },

    async matchRows(rawRows: CreateImportRawRow[]): Promise<CreateImportPreviewResult> {
        const [allStores, allUsers] = await Promise.all([
            db.select({ id: stores.id, name: stores.name }).from(stores),
            db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users),
        ])
        const userLabel = (u: { firstName: string; lastName: string | null }) => `${u.firstName} ${u.lastName ?? ""}`.trim()

        const rows: CreateImportMatchedRow[] = rawRows.map((raw) => {
            const storeMatch = matchExactOrFuzzy(raw.storeName, allStores, (s) => s.name)
            const personMatch = looksLikeEmail(raw.personName)
                ? matchExactOrFuzzy(raw.personName, allUsers, (u) => u.email)
                : matchExactOrFuzzy(raw.personName, allUsers, userLabel)

            return {
                rowIndex: raw.rowIndex,
                raw: { checklistName: raw.checklistName, recurrenceText: raw.recurrenceText, question: raw.question, photoRequired: raw.photoRequired, personName: raw.personName, storeName: raw.storeName },
                recurrence: parseRecurrenceText(raw.recurrenceText),
                personId: personMatch.match?.id ?? null,
                personMatchConfidence: personMatch.confidence,
                storeId: storeMatch.match?.id ?? null,
                storeMatchConfidence: storeMatch.confidence,
            }
        })

        return {
            rows,
            groups: buildGroupPreviews(rows),
            stores: allStores,
            users: allUsers.map((u) => ({ id: u.id, name: userLabel(u), email: u.email })),
        }
    },

    async applyBatch(groups: CreateImportGroupInput[], schedule: CreateImportSchedule, user: AccessTokenPayload): Promise<CreateImportSummary> {
        if (!groups.length) throw AppError.badRequest("Nothing to create.")
        const startDate = schedule.startDate ?? new Date().toISOString()

        let created = 0
        const failed: { name: string; message: string }[] = []
        for (const group of groups) {
            try {
                const input: CreateChecklistDefinitionInput = {
                    name: group.name,
                    recurrence: group.recurrence,
                    storeIds: group.storeIds,
                    assigneeIds: group.assigneeIds,
                    startDate,
                    opensTime: schedule.opensTime,
                    cutoffTime: schedule.cutoffTime,
                    responseMode: schedule.responseMode,
                    items: group.items.map((item, index) => ({
                        ...EMPTY_ITEM_DEFAULTS,
                        label: item.label,
                        order: index,
                        requiredImageCount: item.photoRequired ? 1 : 0,
                    })),
                }
                await checklistDefinitionService.create(input, user)
                created++
            } catch (err) {
                failed.push({ name: group.name, message: err instanceof AppError ? err.message : "Failed to create this checklist." })
            }
        }
        return { created, failed }
    },
}
