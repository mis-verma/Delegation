import { db } from "../../config/db.js"
import { tags } from "../../db/schema/index.js"
import { parse as parseCsv } from "csv-parse/sync"
import ExcelJS from "exceljs"
import { AppError } from "../../utils/AppError.js"
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

// A date is "invalid" only when text was actually typed and couldn't be parsed — an empty cell
// is a legitimate "no date" the same as leaving the field blank in the create-delegation form.
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
    // Never "none" — an unrecognized or blank priority text still resolves to a real, usable
    // value (the same default the create-delegation form itself uses), it just isn't "matched".
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

// Accepted column headers, case-insensitive — same tolerance approach as the checklist
// bulk-importer's HEADER_ALIASES (see checklistBulkImport.service.ts).
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
    // A fully blank row (e.g. a trailing empty line) carries nothing worth previewing. Unlike
    // the checklist importer, a row missing only `title` (the one truly required field) is still
    // kept — it surfaces in the review table as unresolved rather than silently vanishing, which
    // would otherwise look like rows went missing from the upload.
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
            if (header) record[header] = String(cell.value ?? "").trim()
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
    // Blank is a normal default, not a mismatch — only flag `matched: false` when text was
    // actually given and didn't resolve, mirroring the assignee/department "text vs empty"
    // distinction used everywhere else in this file.
    return { priority: "medium", matched: !n }
}

const resolveDate = (raw: string | undefined): DateField => {
    if (!raw) return { raw: "", iso: null, valid: true }
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return { raw, iso: null, valid: false }
    return { raw, iso: d.toISOString(), valid: true }
}

export const taskBulkImportService = {
    async parseFile(buffer: Buffer, mimetype: string): Promise<{ rows: TaskBulkImportRawRow[] }> {
        // "application/vnd.ms-excel" is also what some browsers/OSes report a .csv as (same
        // ambiguity handled the same way by the checklist bulk-importer and task attachments).
        if (mimetype === "text/csv" || mimetype === "application/vnd.ms-excel") {
            return { rows: parseCsvRows(buffer) }
        }
        if (mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
            return { rows: await parseXlsxRows(buffer) }
        }
        throw AppError.unprocessable("Unsupported file type — upload a CSV or Excel (.xlsx) file.")
    },

    async matchRows(rawRows: TaskBulkImportRawRow[], actor: AccessTokenPayload): Promise<TaskBulkImportPreviewResult> {
        // `listAssignable` with no department/store filter — for ADMIN/PC (the only roles this
        // route is gated to, see task.routes.ts) that's every active user, same roster the normal
        // create-delegation form's Assignee field offers them.
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
                startDate: resolveDate(raw.startDate),
                dueDate: resolveDate(raw.dueDate),
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

    // Each row is an outright insert, not a merge (unlike the checklist importer's applyBatch,
    // which only ever widens an existing definition's storeIds/assigneeIds) — so one bad row must
    // not sink the rest of the batch. taskService.create() already does its own DB write,
    // notification, and audit record per call; this just calls it once per row inside its own
    // try/catch and keeps going.
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
