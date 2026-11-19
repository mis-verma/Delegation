import { lateWindowProblem } from "./lateWindow.js"
import { db } from "../../config/db.js"
import { stores, users } from "../../db/schema/index.js"
import { and, eq, inArray } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { parseSheetRecords, type SheetRecord } from "../../utils/sheetRows.js"
import { checklistDefinitionService, listAllChecklistDefinitions, toItemInput } from "./checklistDefinition.service.js"
import type { UpdateChecklistDefinitionInput } from "./checklistDefinition.validation.js"
import { matchExactOrFuzzy, looksLikeEmail, type MatchConfidence } from "../../utils/fuzzyMatch.js"

export type BulkImportRawRow = {
    rowIndex: number
    checklistName: string
    storeName: string
    personName: string
    department?: string
}

export type BulkImportMatchedRow = {
    rowIndex: number
    raw: { checklistName: string; storeName: string; personName: string; department?: string }
    checklistDefinitionId: string | null
    checklistMatchConfidence: MatchConfidence
    storeId: string | null
    storeMatchConfidence: MatchConfidence
    userId: string | null
    userMatchConfidence: MatchConfidence
}

export type BulkImportPreviewResult = {
    rows: BulkImportMatchedRow[]
    checklists: { id: string; name: string }[]
    stores: { id: string; name: string }[]
    users: { id: string; name: string; email: string }[]
}

export type BulkImportApplyRow = { checklistDefinitionId: string; storeId: string; userId: string }
export type BulkImportSchedule = { startDate?: string; opensTime?: string; cutoffTime?: string }
export type BulkImportApplySummary = {
    updatedDefinitions: number
    storesAdded: number
    assigneesAdded: number
    failed: { definitionId: string; message: string }[]
}

const HEADER_ALIASES: Record<string, "checklistName" | "storeName" | "personName" | "department"> = {
    "checklist name": "checklistName",
    "checklist": "checklistName",
    "checklist title": "checklistName",
    "store": "storeName",
    "store name": "storeName",
    "location": "storeName",
    "person": "personName",
    "assignee": "personName",
    "assigned to": "personName",
    "email": "personName",
    "user": "personName",
    "department": "department",
    "dept": "department",
}

const buildRowFromRecord = (record: SheetRecord, rowIndex: number): BulkImportRawRow | null => {
    const mapped: Partial<Record<"checklistName" | "storeName" | "personName" | "department", string>> = {}
    for (const [key, value] of Object.entries(record)) {
        const canonical = HEADER_ALIASES[key.trim().toLowerCase()]
        if (!canonical) continue
        const v = String(value ?? "").trim()
        if (v) mapped[canonical] = v
    }
    if (!mapped.checklistName && !mapped.storeName && !mapped.personName) return null
    return {
        rowIndex,
        checklistName: mapped.checklistName ?? "",
        storeName: mapped.storeName ?? "",
        personName: mapped.personName ?? "",
        department: mapped.department,
    }
}

export const checklistBulkImportService = {
    async parseFile(buffer: Buffer, mimetype: string): Promise<{ rows: BulkImportRawRow[]; warnings: string[] }> {
        const { records, warnings } = await parseSheetRecords(buffer, mimetype)
        const rows = records
            .map((r, i) => buildRowFromRecord(r, i + 1))
            .filter((r): r is BulkImportRawRow => r !== null)
        return { rows, warnings }
    },

    async matchRows(rawRows: BulkImportRawRow[]): Promise<BulkImportPreviewResult> {
        const [definitions, allStores, allUsers] = await Promise.all([
            listAllChecklistDefinitions(),
            db.select({ id: stores.id, name: stores.name }).from(stores),
            db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users),
        ])
        const userLabel = (u: { firstName: string; lastName: string | null }) => `${u.firstName} ${u.lastName ?? ""}`.trim()

        const rows: BulkImportMatchedRow[] = rawRows.map((raw) => {
            const checklistMatch = matchExactOrFuzzy(raw.checklistName, definitions, (d) => d.name)
            const storeMatch = matchExactOrFuzzy(raw.storeName, allStores, (s) => s.name)
            const userMatch = looksLikeEmail(raw.personName)
                ? matchExactOrFuzzy(raw.personName, allUsers, (u) => u.email)
                : matchExactOrFuzzy(raw.personName, allUsers, userLabel)

            return {
                rowIndex: raw.rowIndex,
                raw: { checklistName: raw.checklistName, storeName: raw.storeName, personName: raw.personName, department: raw.department },
                checklistDefinitionId: checklistMatch.match?.id ?? null,
                checklistMatchConfidence: checklistMatch.confidence,
                storeId: storeMatch.match?.id ?? null,
                storeMatchConfidence: storeMatch.confidence,
                userId: userMatch.match?.id ?? null,
                userMatchConfidence: userMatch.confidence,
            }
        })

        return {
            rows,
            checklists: definitions.map((d) => ({ id: d.id, name: d.name })),
            stores: allStores,
            users: allUsers.map((u) => ({ id: u.id, name: userLabel(u), email: u.email })),
        }
    },

    async applyBatch(rows: BulkImportApplyRow[], schedule: BulkImportSchedule, actorId: string): Promise<BulkImportApplySummary> {
        if (!rows.length) throw AppError.badRequest("No rows to apply.")

        const groups = new Map<string, { storeIds: Set<string>; userIds: Set<string> }>()
        for (const row of rows) {
            const group = groups.get(row.checklistDefinitionId) ?? { storeIds: new Set<string>(), userIds: new Set<string>() }
            group.storeIds.add(row.storeId)
            group.userIds.add(row.userId)
            groups.set(row.checklistDefinitionId, group)
        }

        let updatedDefinitions = 0
        let storesAdded = 0
        let assigneesAdded = 0
        const failed: { definitionId: string; message: string }[] = []

    
        for (const [definitionId, group] of groups) {
            try {
                const existing = await checklistDefinitionService.getById(definitionId)
                const unionedStoreIds = Array.from(new Set([...existing.storeIds, ...group.storeIds]))
                const candidateAssigneeIds = Array.from(new Set([...existing.assigneeIds, ...group.userIds]))
                const stillValid = candidateAssigneeIds.length
                    ? await db.select({ id: users.id, storeId: users.storeId }).from(users).where(and(inArray(users.id, candidateAssigneeIds), eq(users.isActive, true)))
                    : []
                const storeSet = new Set(unionedStoreIds)
                const validIds = new Set(stillValid.filter((u) => u.storeId && storeSet.has(u.storeId)).map((u) => u.id))
                const unionedAssigneeIds = candidateAssigneeIds.filter((id) => validIds.has(id))

             
                const nextOpens = schedule.opensTime ?? existing.opensTime ?? undefined
                const nextCutoff = schedule.cutoffTime ?? existing.cutoffTime ?? undefined
                const keptLateUntil = existing.lateUntilTime
                    && !lateWindowProblem({ recurrence: existing.recurrence, opensTime: nextOpens, cutoffTime: nextCutoff, lateUntilTime: existing.lateUntilTime })
                    ? existing.lateUntilTime
                    : undefined
                const input: UpdateChecklistDefinitionInput = {
                   
                    version: existing.version,
                    name: existing.name,
                    description: existing.description ?? undefined,
                    storeIds: unionedStoreIds,
                    recurrence: existing.recurrence,
                    startDate: schedule.startDate ?? new Date(existing.startDate).toISOString(),
                    opensTime: schedule.opensTime ?? existing.opensTime ?? undefined,
                    cutoffTime: schedule.cutoffTime ?? existing.cutoffTime ?? undefined,
                    lateUntilTime: keptLateUntil,
                    assigneeIds: unionedAssigneeIds,
                    reviewerIds: existing.reviewerIds.length ? existing.reviewerIds : undefined,
                    assigneeRoles: existing.assigneeRoles ?? undefined,
                    icon: existing.icon ?? undefined,
                    items: existing.items.map(toItemInput),
                }
                await checklistDefinitionService.update(definitionId, input, actorId)

                storesAdded += unionedStoreIds.length - existing.storeIds.length
                assigneesAdded += unionedAssigneeIds.length - existing.assigneeIds.length
                updatedDefinitions++
            } catch (err) {
                failed.push({ definitionId, message: err instanceof AppError ? err.message : "Failed to update this checklist." })
            }
        }

        return { updatedDefinitions, storesAdded, assigneesAdded, failed }
    },
}
