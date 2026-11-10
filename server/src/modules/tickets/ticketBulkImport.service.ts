import { db } from "../../config/db.js"
import { MAX_TAT_HOURS } from "../../utils/tatLimits.js"
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
    subcategoryName?: string
    tatHours?: string
    dueDate?: string
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
        subcategoryName?: string
        tatHours?: string
        dueDate?: string
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
    subcategoryId: string | null
    subcategoryMatchConfidence: MatchConfidence
    subcategoryRequired: boolean
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
    categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[]
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
    subcategoryId?: string
    tatHours?: number
    tagIds?: string[]
}

export type TicketBulkImportSummary = {
    created: number
    failed: { rowIndex: number; message: string }[]
}

type CanonicalField = "title" | "description" | "assigneeName" | "priority" | "departmentName" | "storeName" | "categoryName" | "subcategoryName" | "tatHours" | "dueDate" | "labels"

const HEADER_ALIASES: Record<string, CanonicalField> = {
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
    "subcategory": "subcategoryName",
    "sub category": "subcategoryName",
    "sub-category": "subcategoryName",
    "tat hours": "tatHours",
    "tat": "tatHours",
    "turnaround hours": "tatHours",
    "due date": "dueDate",
    "due": "dueDate",
    "deadline": "dueDate",
    "due by": "dueDate",
    "labels": "labels",
    "label": "labels",
    "tags": "labels",
    "tag": "labels",
}

const cellText = (value: ExcelJS.CellValue): string => {
    if (value === null || value === undefined) return ""
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    if (typeof value === "object") {
        const v = value as { text?: unknown; richText?: { text: string }[]; result?: unknown }
        if (Array.isArray(v.richText)) return v.richText.map((part) => part.text).join("")
        if (v.result !== undefined) return cellText(v.result as ExcelJS.CellValue)
        if (typeof v.text === "string") return v.text
        return ""
    }
    return String(value)
}

const splitLabels = (value: string): string[] =>
    value.split(",").map((s) => s.trim()).filter(Boolean)

const buildRowFromRecord = (record: Record<string, string>, rowIndex: number): TicketBulkImportRawRow | null => {
    const mapped: Partial<Record<CanonicalField, string>> = {}
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
        subcategoryName: mapped.subcategoryName,
        tatHours: mapped.tatHours,
        dueDate: mapped.dueDate,
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
        headers[colNumber] = cellText(cell.value).trim()
    })

    const rows: TicketBulkImportRawRow[] = []
    for (let r = 2; r <= sheet.rowCount; r++) {
        const record: Record<string, string> = {}
        sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber]
            if (header) record[header] = cellText(cell.value).trim()
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
    if (!Number.isFinite(n) || n <= 0 || n > MAX_TAT_HOURS) return { tatHours: null, invalid: true }
    return { tatHours: n, invalid: false }
}

const ORG_UTC_OFFSET = "+05:30"
const DUE_TIME = "18:00"
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const pad2 = (n: number) => String(n).padStart(2, "0")

export const parseDueDate = (text: string): Date | null => {
    const t = text.trim()
    let year = 0
    let month = 0
    let day = 0
    const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
    if (iso) {
        year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3])
    } else if (dmy) {
        day = Number(dmy[1]); month = Number(dmy[2]); year = Number(dmy[3])
        if (year < 100) year += 2000
    } else {
        const dayFirst = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s*(\d{4})?$/)
        const monthFirst = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/)
        const parts = dayFirst ? { d: dayFirst[1], m: dayFirst[2], y: dayFirst[3] } : monthFirst ? { d: monthFirst[2], m: monthFirst[1], y: monthFirst[3] } : null
        const monthIndex = parts ? MONTHS.indexOf(parts.m!.slice(0, 3).toLowerCase()) : -1
        if (!parts || monthIndex < 0) return null
        day = Number(parts.d)
        month = monthIndex + 1
        year = parts.y ? Number(parts.y) : new Date().getFullYear()
    }
    const calendar = new Date(Date.UTC(year, month - 1, day))
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day) return null
    return new Date(`${year}-${pad2(month)}-${pad2(day)}T${DUE_TIME}:00${ORG_UTC_OFFSET}`)
}

export const resolveDueHours = (raw: string): { tatHours: number | null; invalid: boolean } => {
    const due = parseDueDate(raw)
    if (!due) return { tatHours: null, invalid: true }
    const hours = Math.ceil((due.getTime() - Date.now()) / 3_600_000)
    if (hours <= 0 || hours > MAX_TAT_HOURS) return { tatHours: null, invalid: true }
    return { tatHours: hours, invalid: false }
}

const emailInBrackets = (value: string): string | undefined => value.match(/\(([^()\s]+@[^()\s]+)\)\s*$/)?.[1]

export const ticketBulkImportService = {
    async parseFile(buffer: Buffer, mimetype: string): Promise<{ rows: TicketBulkImportRawRow[] }> {
        const startsWith = (a: number, b: number) => buffer.length > 3 && buffer[0] === a && buffer[1] === b
        if (startsWith(0xd0, 0xcf)) {
            throw AppError.unprocessable("That is an old Excel (.xls) file. Open it, choose Save As, and pick Excel Workbook (.xlsx) or CSV.")
        }
        if (startsWith(0x50, 0x4b)) return { rows: await parseXlsxRows(buffer) }
        if (["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"].includes(mimetype)) {
            return { rows: parseCsvRows(buffer) }
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
            const bracketEmail = raw.assigneeName ? emailInBrackets(raw.assigneeName) : undefined
            const assigneeMatch = raw.assigneeName
                ? (bracketEmail || looksLikeEmail(raw.assigneeName)
                    ? matchExactOrFuzzy(bracketEmail ?? raw.assigneeName, assignableUsers, (u) => u.email)
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
            const activeSubcategories = (allCategories.find((c) => c.id === categoryMatch.match?.id)?.subcategories ?? []).filter((s) => s.isActive)
            const subcategoryMatch = raw.subcategoryName && activeSubcategories.length
                ? matchExactOrFuzzy(raw.subcategoryName, activeSubcategories, (s) => s.name)
                : { match: null, confidence: "none" as MatchConfidence }
            const { priority, matched: priorityMatched } = resolvePriority(raw.priority)
            const explicitTat = resolveTatHours(raw.tatHours)
            const fromDue = !raw.tatHours && raw.dueDate ? resolveDueHours(raw.dueDate) : null
            const tatHours = explicitTat.tatHours ?? fromDue?.tatHours ?? null
            const tatHoursInvalid = explicitTat.invalid || !!fromDue?.invalid

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
                    subcategoryName: raw.subcategoryName,
                    tatHours: raw.tatHours,
                    dueDate: raw.dueDate,
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
                subcategoryId: subcategoryMatch.match?.id ?? null,
                subcategoryMatchConfidence: subcategoryMatch.confidence,
                subcategoryRequired: activeSubcategories.length > 0,
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
            categories: allCategories.map((c) => ({ id: c.id, name: c.name, subcategories: c.subcategories.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name })) })),
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
                    subcategoryId: row.subcategoryId,
                    tatHours: row.tatHours,
                    tagIds: row.tagIds,
                }
                await ticketService.create(input, actor, { skipHeadGate: true })
                created++
            } catch (err) {
                failed.push({ rowIndex: row.rowIndex, message: err instanceof AppError ? err.message : "Failed to create this ticket." })
            }
        }

        return { created, failed }
    },
}
