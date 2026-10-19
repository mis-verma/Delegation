import { db } from "../../config/db.js"
import { tags, stores } from "../../db/schema/index.js"
import { TICKET_PRIORITIES } from "../../db/schema/ticket.js"
import { parse as parseCsv } from "csv-parse/sync"
import ExcelJS from "exceljs"
import { AppError } from "../../utils/AppError.js"
import { matchExactOrFuzzy, looksLikeEmail, type MatchConfidence } from "../../utils/fuzzyMatch.js"
import { ticketService } from "./ticket.service.js"
import { userService } from "../users/user.service.js"
import { departmentService } from "../departments/department.service.js"
import { categoryService } from "../categories/category.service.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateTicketInput } from "./ticket.validation.js"

type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export type TicketBulkImportRawRow = {
    rowIndex: number
    title: string
    description?: string
    assigneeName?: string
    priority?: string
    departmentName?: string
    storeName?: string
    categoryName?: string
    tatHours?: string
    labelNames: string[]
}

export type TicketBulkImportMatchedRow = {
    rowIndex: number
    raw: {
        title: string
        description?: string
        assigneeName?: string
        priority?: string
        departmentName?: string
        storeName?: string
        categoryName?: string
        tatHours?: string
        labelNames: string[]
    }
    assigneeId: string | null
    assigneeMatchConfidence: MatchConfidence
    departmentId: string | null
    departmentMatchConfidence: MatchConfidence
    storeId: string | null
    storeMatchConfidence: MatchConfidence
    categoryId: string | null
    categoryMatchConfidence: MatchConfidence
    priority: TicketPriority
    priorityMatched: boolean
    tatHours: number | null
    tatHoursInvalid: boolean
    tagIds: string[]
    unmatchedLabelNames: string[]
}

export type TicketBulkImportPreviewResult = {
    rows: TicketBulkImportMatchedRow[]
    assignableUsers: { id: string; name: string; email: string }[]
    departments: { id: string; name: string }[]
    stores: { id: string; name: string }[]
    categories: { id: string; name: string }[]
    tags: { id: string; name: string }[]
}

export type TicketBulkImportApplyRow = {
    rowIndex: number
    title: string
    description: string
    assigneeId?: string
    priority?: TicketPriority
    departmentId?: string
    storeId?: string
    categoryId?: string
    tatHours?: number
    tagIds?: string[]
}

export type TicketBulkImportSummary = {
    created: number
    failed: { rowIndex: number; message: string }[]
}

const HEADER_ALIASES: Record<string, "title" | "description" | "assigneeName" | "priority" | "departmentName" | "storeName" | "categoryName" | "tatHours" | "labels"> = {
    "title": "title",
    "ticket title": "title",
    "subject": "title",
    "description": "description",
    "details": "description",
    "notes": "description",
    "assignee": "assigneeName",
    "assigned to": "assigneeName",
    "owner": "assigneeName",
    "person": "assigneeName",
    "email": "assigneeName",
    "user": "assigneeName",
    "priority": "priority",
    "department": "departmentName",
    "dept": "departmentName",
    "store": "storeName",
    "store name": "storeName",
    "location": "storeName",
    "category": "categoryName",
    "ticket category": "categoryName",
    "tat hours": "tatHours",
    "tat": "tatHours",
    "turnaround hours": "tatHours",
    "labels": "labels",
    "label": "labels",
    "tags": "labels",
    "tag": "labels",
}

const splitLabels = (value: string): string[] =>
    value.split(",").map((s) => s.trim()).filter(Boolean)

const buildRowFromRecord = (record: Record<string, string>, rowIndex: number): TicketBulkImportRawRow | null => {
    const mapped: Partial<Record<"title" | "description" | "assigneeName" | "priority" | "departmentName" | "storeName" | "categoryName" | "tatHours" | "labels", string>> = {}
    for (const [key, value] of Object.entries(record)) {
        const canonical = HEADER_ALIASES[key.trim().toLowerCase()]
        if (!canonical) continue
        const v = String(value ?? "").trim()
        if (v) mapped[canonical] = v
    }
    if (!mapped.title && !mapped.description && !mapped.assigneeName && !mapped.departmentName) return null
    return {
        rowIndex,
        title: mapped.title ?? "",
        description: mapped.description,
        assigneeName: mapped.assigneeName,
        priority: mapped.priority,
        departmentName: mapped.departmentName,
        storeName: mapped.storeName,
        categoryName: mapped.categoryName,
        tatHours: mapped.tatHours,
        labelNames: mapped.labels ? splitLabels(mapped.labels) : [],
    }
}

const parseCsvRows = (buffer: Buffer): TicketBulkImportRawRow[] => {
    const records = parseCsv(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[]
    return records
        .map((r, i) => buildRowFromRecord(r, i + 1))
        .filter((r): r is TicketBulkImportRawRow => r !== null)
}

const parseXlsxRows = async (buffer: Buffer): Promise<TicketBulkImportRawRow[]> => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) return []

    const headers: string[] = []
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber] = String(cell.value ?? "").trim()
    })

    const rows: TicketBulkImportRawRow[] = []
    for (let r = 2; r <= sheet.rowCount; r++) {
        const record: Record<string, string> = {}
        sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber]
            if (header) record[header] = String(cell.value ?? "").trim()
        })
        const built = buildRowFromRecord(record, r - 1)
        if (built) rows.push(built)
    }
    return rows
}

const resolvePriority = (raw: string | undefined): { priority: TicketPriority; matched: boolean } => {
    const n = raw?.trim().toUpperCase()
    if (n && (TICKET_PRIORITIES as readonly string[]).includes(n)) return { priority: n as TicketPriority, matched: true }
    return { priority: "MEDIUM", matched: !n }
}

const resolveTatHours = (raw: string | undefined): { tatHours: number | null; invalid: boolean } => {
    if (!raw) return { tatHours: null, invalid: false }
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return { tatHours: null, invalid: true }
    return { tatHours: n, invalid: false }
}

export const ticketBulkImportService = {
    async parseFile(buffer: Buffer, mimetype: string): Promise<{ rows: TicketBulkImportRawRow[] }> {
        if (mimetype === "text/csv" || mimetype === "application/vnd.ms-excel") {
            return { rows: parseCsvRows(buffer) }
        }
        if (mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
            return { rows: await parseXlsxRows(buffer) }
        }
        throw AppError.unprocessable("That file type isn't supported. Upload a CSV or Excel (.xlsx) file.")
    },

    async matchRows(rawRows: TicketBulkImportRawRow[], actor: AccessTokenPayload): Promise<TicketBulkImportPreviewResult> {
        const [assignableUsers, { data: departments }, allStores, allCategories, allTags] = await Promise.all([
            userService.listAssignable(actor),
            departmentService.list(),
            db.select({ id: stores.id, name: stores.name }).from(stores),
            categoryService.list(),
            db.select({ id: tags.id, name: tags.name }).from(tags),
        ])
        const userLabel = (u: { firstName: string; lastName: string | null }) => `${u.firstName} ${u.lastName ?? ""}`.trim()

        const rows: TicketBulkImportMatchedRow[] = rawRows.map((raw) => {
            const assigneeMatch = raw.assigneeName
                ? (looksLikeEmail(raw.assigneeName)
                    ? matchExactOrFuzzy(raw.assigneeName, assignableUsers, (u) => u.email)
                    : matchExactOrFuzzy(raw.assigneeName, assignableUsers, userLabel))
                : { match: null, confidence: "none" as MatchConfidence }
            const departmentMatch = raw.departmentName
                ? matchExactOrFuzzy(raw.departmentName, departments, (d) => d.name)
                : { match: null, confidence: "none" as MatchConfidence }
            const storeMatch = raw.storeName
                ? matchExactOrFuzzy(raw.storeName, allStores, (s) => s.name)
                : { match: null, confidence: "none" as MatchConfidence }
            const categoryMatch = raw.categoryName
                ? matchExactOrFuzzy(raw.categoryName, allCategories, (c) => c.name)
                : { match: null, confidence: "none" as MatchConfidence }
            const { priority, matched: priorityMatched } = resolvePriority(raw.priority)
            const { tatHours, invalid: tatHoursInvalid } = resolveTatHours(raw.tatHours)

            const labelMatches = raw.labelNames.map((name) => ({ name, ...matchExactOrFuzzy(name, allTags, (t) => t.name) }))
            const tagIds = labelMatches.filter((m) => m.match).map((m) => m.match!.id)
            const unmatchedLabelNames = labelMatches.filter((m) => !m.match).map((m) => m.name)

            return {
                rowIndex: raw.rowIndex,
                raw: {
                    title: raw.title,
                    description: raw.description,
                    assigneeName: raw.assigneeName,
                    priority: raw.priority,
                    departmentName: raw.departmentName,
                    storeName: raw.storeName,
                    categoryName: raw.categoryName,
                    tatHours: raw.tatHours,
                    labelNames: raw.labelNames,
                },
                assigneeId: assigneeMatch.match?.id ?? null,
                assigneeMatchConfidence: assigneeMatch.confidence,
                departmentId: departmentMatch.match?.id ?? null,
                departmentMatchConfidence: departmentMatch.confidence,
                storeId: storeMatch.match?.id ?? null,
                storeMatchConfidence: storeMatch.confidence,
                categoryId: categoryMatch.match?.id ?? null,
                categoryMatchConfidence: categoryMatch.confidence,
                priority,
                priorityMatched,
                tatHours,
                tatHoursInvalid,
                tagIds,
                unmatchedLabelNames,
            }
        })

        return {
            rows,
            assignableUsers: assignableUsers.map((u) => ({ id: u.id, name: userLabel(u), email: u.email })),
            departments: departments.map((d) => ({ id: d.id, name: d.name })),
            stores: allStores,
            categories: allCategories.map((c) => ({ id: c.id, name: c.name })),
            tags: allTags,
        }
    },

    async applyBatch(rows: TicketBulkImportApplyRow[], actor: AccessTokenPayload): Promise<TicketBulkImportSummary> {
        if (!rows.length) throw AppError.badRequest("No rows to apply.")

        let created = 0
        const failed: { rowIndex: number; message: string }[] = []

        for (const row of rows) {
            try {
                const input: CreateTicketInput = {
                    title: row.title,
                    description: row.description,
                    priority: row.priority,
                    assigneeId: row.assigneeId,
                    departmentId: row.departmentId,
                    storeId: row.storeId,
                    categoryId: row.categoryId,
                    tatHours: row.tatHours,
                    tagIds: row.tagIds,
                }
                await ticketService.create(input, actor)
                created++
            } catch (err) {
                failed.push({ rowIndex: row.rowIndex, message: err instanceof AppError ? err.message : "Failed to create this ticket." })
            }
        }

        return { created, failed }
    },
}
