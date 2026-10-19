import { db } from "../../config/db.js"
import { tags } from "../../db/schema/index.js"
import { parse as parseCsv } from "csv-parse/sync"
import ExcelJS from "exceljs"
import { AppError } from "../../utils/AppError.js"
import { env } from "../../config/env.js"
import { matchExactOrFuzzy, looksLikeEmail, type MatchConfidence } from "../../utils/fuzzyMatch.js"
import { taskService } from "./task.service.js"
import { userService } from "../users/user.service.js"
import { departmentService } from "../departments/department.service.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateTaskInput } from "./task.validation.js"

export type TaskBulkImportRawRow = {
    rowIndex: number
    title: string
    description?: string
    assigneeName?: string
    priority?: string
    startDate?: string
    dueDate?: string
    departmentName?: string
    labelNames: string[]
}

type DateField = { raw: string; iso: string | null; valid: boolean }

export type TaskBulkImportMatchedRow = {
    rowIndex: number
    raw: {
        title: string
        description?: string
        assigneeName?: string
        priority?: string
        departmentName?: string
        labelNames: string[]
    }
    assigneeId: string | null
    assigneeMatchConfidence: MatchConfidence
    departmentId: string | null
    departmentMatchConfidence: MatchConfidence
    priority: "low" | "medium" | "high"
    priorityMatched: boolean
    startDate: DateField
    dueDate: DateField
    tagIds: string[]
    unmatchedLabelNames: string[]
}

export type TaskBulkImportPreviewResult = {
    rows: TaskBulkImportMatchedRow[]
    assignableUsers: { id: string; name: string; email: string }[]
    departments: { id: string; name: string }[]
    tags: { id: string; name: string }[]
}

export type TaskBulkImportApplyRow = {
    rowIndex: number
    title: string
    description?: string
    assigneeId?: string
    priority?: "low" | "medium" | "high"
    startDate?: string
    dueDate?: string
    departmentId?: string
    tagIds?: string[]
}

export type TaskBulkImportSummary = {
    created: number
    failed: { rowIndex: number; message: string }[]
}

const HEADER_ALIASES: Record<string, "title" | "description" | "assigneeName" | "priority" | "startDate" | "dueDate" | "departmentName" | "labels"> = {
    "title": "title",
    "delegation title": "title",
    "task": "title",
    "task title": "title",
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
    "start date": "startDate",
    "start": "startDate",
    "due date": "dueDate",
    "due": "dueDate",
    "deadline": "dueDate",
    "department": "departmentName",
    "dept": "departmentName",
    "labels": "labels",
    "label": "labels",
    "tags": "labels",
    "tag": "labels",
}

const splitLabels = (value: string): string[] =>
    value.split(",").map((s) => s.trim()).filter(Boolean)

const buildRowFromRecord = (record: Record<string, string>, rowIndex: number): TaskBulkImportRawRow | null => {
    const mapped: Partial<Record<"title" | "description" | "assigneeName" | "priority" | "startDate" | "dueDate" | "departmentName" | "labels", string>> = {}
    for (const [key, value] of Object.entries(record)) {
        const canonical = HEADER_ALIASES[key.trim().toLowerCase()]
        if (!canonical) continue
        const v = String(value ?? "").trim()
        if (v) mapped[canonical] = v
    }
    if (!mapped.title && !mapped.assigneeName && !mapped.departmentName && !mapped.description) return null
    return {
        rowIndex,
        title: mapped.title ?? "",
        description: mapped.description,
        assigneeName: mapped.assigneeName,
        priority: mapped.priority,
        startDate: mapped.startDate,
        dueDate: mapped.dueDate,
        departmentName: mapped.departmentName,
        labelNames: mapped.labels ? splitLabels(mapped.labels) : [],
    }
}

const parseCsvRows = (buffer: Buffer): TaskBulkImportRawRow[] => {
    const records = parseCsv(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[]
    return records
        .map((r, i) => buildRowFromRecord(r, i + 1))
        .filter((r): r is TaskBulkImportRawRow => r !== null)
}

const parseXlsxRows = async (buffer: Buffer): Promise<TaskBulkImportRawRow[]> => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) return []

    const headers: string[] = []
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber] = String(cell.value ?? "").trim()
    })

    const rows: TaskBulkImportRawRow[] = []
    for (let r = 2; r <= sheet.rowCount; r++) {
        const record: Record<string, string> = {}
        sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber]
            if (!header) return
            record[header] = cell.value instanceof Date
                ? cell.value.toISOString().slice(0, 10)
                : String(cell.value ?? "").trim()
        })
        const built = buildRowFromRecord(record, r - 1)
        if (built) rows.push(built)
    }
    return rows
}

const PRIORITIES = ["low", "medium", "high"] as const

const resolvePriority = (raw: string | undefined): { priority: "low" | "medium" | "high"; matched: boolean } => {
    const n = raw?.trim().toLowerCase()
    if (n && (PRIORITIES as readonly string[]).includes(n)) return { priority: n as "low" | "medium" | "high", matched: true }
    return { priority: "medium", matched: !n }
}

const DAY_FIRST_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const MINUTE_MS = 60_000

const orgDayBoundary = (year: number, month: number, day: number, edge: "start" | "end"): Date | null => {
    const probe = new Date(Date.UTC(year, month - 1, day))
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
    const localMs = edge === "end" ? Date.UTC(year, month - 1, day, 23, 59) : Date.UTC(year, month - 1, day)
    return new Date(localMs - env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * MINUTE_MS)
}

const resolveDate = (raw: string | undefined, edge: "start" | "end"): DateField => {
    if (!raw) return { raw: "", iso: null, valid: true }
    const text = raw.trim()

    let parts: { year: number; month: number; day: number } | null = null
    const dayFirst = DAY_FIRST_DATE.exec(text)
    const iso = ISO_DATE.exec(text)
    if (dayFirst) {
        const year = Number(dayFirst[3])
        parts = { day: Number(dayFirst[1]), month: Number(dayFirst[2]), year: year < 100 ? 2000 + year : year }
    } else if (iso) {
        parts = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    } else {
        const parsed = new Date(text)
        if (Number.isNaN(parsed.getTime())) return { raw, iso: null, valid: false }
        const local = new Date(parsed.getTime() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * MINUTE_MS)
        parts = { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate() }
    }

    const at = orgDayBoundary(parts.year, parts.month, parts.day, edge)
    if (!at) return { raw, iso: null, valid: false }
    return { raw, iso: at.toISOString(), valid: true }
}

export const taskBulkImportService = {
    async parseFile(buffer: Buffer, mimetype: string): Promise<{ rows: TaskBulkImportRawRow[] }> {
        if (mimetype === "text/csv" || mimetype === "application/vnd.ms-excel") {
            return { rows: parseCsvRows(buffer) }
        }
        if (mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
            return { rows: await parseXlsxRows(buffer) }
        }
        throw AppError.unprocessable("Unsupported file type — upload a CSV or Excel (.xlsx) file.")
    },

    async matchRows(rawRows: TaskBulkImportRawRow[], actor: AccessTokenPayload): Promise<TaskBulkImportPreviewResult> {
        const [assignableUsers, { data: departments }, allTags] = await Promise.all([
            userService.listAssignable(actor),
            departmentService.list(),
            db.select({ id: tags.id, name: tags.name }).from(tags),
        ])
        const userLabel = (u: { firstName: string; lastName: string | null }) => `${u.firstName} ${u.lastName ?? ""}`.trim()

        const rows: TaskBulkImportMatchedRow[] = rawRows.map((raw) => {
            const assigneeMatch = raw.assigneeName
                ? (looksLikeEmail(raw.assigneeName)
                    ? matchExactOrFuzzy(raw.assigneeName, assignableUsers, (u) => u.email)
                    : matchExactOrFuzzy(raw.assigneeName, assignableUsers, userLabel))
                : { match: null, confidence: "none" as MatchConfidence }
            const departmentMatch = raw.departmentName
                ? matchExactOrFuzzy(raw.departmentName, departments, (d) => d.name)
                : { match: null, confidence: "none" as MatchConfidence }
            const { priority, matched: priorityMatched } = resolvePriority(raw.priority)

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
                    labelNames: raw.labelNames,
                },
                assigneeId: assigneeMatch.match?.id ?? null,
                assigneeMatchConfidence: assigneeMatch.confidence,
                departmentId: departmentMatch.match?.id ?? null,
                departmentMatchConfidence: departmentMatch.confidence,
                priority,
                priorityMatched,
                startDate: resolveDate(raw.startDate, "start"),
                dueDate: resolveDate(raw.dueDate, "end"),
                tagIds,
                unmatchedLabelNames,
            }
        })

        return {
            rows,
            assignableUsers: assignableUsers.map((u) => ({ id: u.id, name: userLabel(u), email: u.email })),
            departments: departments.map((d) => ({ id: d.id, name: d.name })),
            tags: allTags,
        }
    },

    async applyBatch(rows: TaskBulkImportApplyRow[], actor: AccessTokenPayload): Promise<TaskBulkImportSummary> {
        if (!rows.length) throw AppError.badRequest("No rows to apply.")

        let created = 0
        const failed: { rowIndex: number; message: string }[] = []

        for (const row of rows) {
            try {
                const input: CreateTaskInput = {
                    title: row.title,
                    description: row.description,
                    priority: row.priority,
                    startDate: row.startDate,
                    dueDate: row.dueDate,
                    assigneeId: row.assigneeId,
                    departmentId: row.departmentId,
                    tagIds: row.tagIds,
                }
                await taskService.create(input, actor)
                created++
            } catch (err) {
                failed.push({ rowIndex: row.rowIndex, message: err instanceof AppError ? err.message : "Failed to create this delegation." })
            }
        }

        return { created, failed }
    },
}
