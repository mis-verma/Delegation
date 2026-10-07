import ExcelJS from "exceljs"
import type { Response } from "express"
import { and, eq, gte, lte, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { departments, stores, users } from "../../db/schema/core.js"
import { checklistDefinitions } from "../../db/schema/checklistDefinition.js"
import { checklistInstanceAssignees, checklistInstanceItems, checklistInstances } from "../../db/schema/checklistInstance.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { streamCsv, type CsvColumn } from "../../utils/csv.js"
import type { ChecklistReportGrouping, ChecklistReportQuery } from "./checklistReport.validation.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportMetrics = {
    assigned: number
    completed: number
    completionPct: number | null
    onTime: number
    onTimePct: number | null
    missed: number
    submitted: number
    approved: number
    sentBack: number
    questionsDone: number
    notApplicable: number
    answersChecked: number
    compliancePct: number | null
}

export type PersonRow = ReportMetrics & {
    userId: string
    name: string
    role: string
    department: string
    store: string
    status: "Active" | "Left"
}

export type DepartmentRow = ReportMetrics & {
    departmentId: string | null
    department: string
    people: number
}

export type ChecklistReport = {
    from: string
    to: string
    generatedAt: string
    storeName: string | null
    departmentName: string | null
    // True when the department filter was forced by the caller's role (MANAGER / SENIOR).
    departmentLocked: boolean
    people: PersonRow[]
    departments: DepartmentRow[]
    notes: string[]
}

export const REPORT_NOTES = [
    "A checklist shared by several people counts as assigned for each of them. Completed, on time, missed, submitted, approved and sent back are counted per person the same way.",
    "A department counts a shared checklist once, even when two of its people are assigned. People is the number of people in the department who had a checklist in this period.",
    "Questions done, Not applicable and Compliance % go by who actually completed each question. Not applicable questions are not counted in Questions done.",
    "Compliance % is the share of answers inside the accepted range, out of Answers checked. Only completed questions with an accepted-answer rule are checked.",
    "A critical question counts double in Compliance %, for or against. Answers checked still counts it once.",
    "A question a reviewer sent back counts as a failed check for the person who had done it, even if it was redone well, and even if it has no accepted-answer rule.",
    "Completed on time means every question was done by the cutoff time. A checklist with no cutoff is due at the end of its day.",
    "Completion % and On-time % are measured against all checklists assigned in the period, including ones that are still open.",
]

const NO_DEPARTMENT_KEY = "__none__"
const NO_DEPARTMENT_LABEL = "No department"

// ---------------------------------------------------------------------------
// SQL fragments
// ---------------------------------------------------------------------------

// Same idea as parentNotDeletedExpr in checklistInstance.service.ts (not exported there): a
// checklist whose template was soft-deleted drops out of every view, reports included.
const parentNotDeletedExpr = sql`NOT EXISTS (
    SELECT 1 FROM ${checklistDefinitions} d
    WHERE d.id = ${checklistInstances.definitionId} AND d.deletedAt IS NOT NULL
)`

const item = checklistInstanceItems

// Mirrors answerVerdict() in client/src/features/checklist/checklistCompliance.ts. An item is
// scored only when it is done, not "not applicable", has an accepted-answer rule that fits its
// type, and carries an answer to compare. The three shapes of "has an answer inside a rule":
//  - YES_NO / PASS_FAIL: booleanAnswer set and acceptableAnswers non-empty
//  - MULTIPLE_CHOICE / DROPDOWN: textValue set (non-empty) and acceptableAnswers non-empty
//  - NUMBER_ENTRY / RATING: numericValue set and at least one of acceptableMin / acceptableMax
const boolScored = sql`(${item.itemType} IN ('YES_NO','PASS_FAIL') AND JSON_LENGTH(${item.acceptableAnswers}) > 0 AND ${item.booleanAnswer} IS NOT NULL)`
const textScored = sql`(${item.itemType} IN ('MULTIPLE_CHOICE','DROPDOWN') AND JSON_LENGTH(${item.acceptableAnswers}) > 0 AND ${item.textValue} IS NOT NULL AND ${item.textValue} <> '')`
const numScored = sql`(${item.itemType} IN ('NUMBER_ENTRY','RATING') AND (${item.acceptableMin} IS NOT NULL OR ${item.acceptableMax} IS NOT NULL) AND ${item.numericValue} IS NOT NULL)`

// A question a reviewer sent back (sendBackCount > 0) is a FAILED check whatever its answer is now,
// even if redone well later and even if it has no accepted-answer rule: it was not right first time.
// It stays scored, and counts as not good, on the person who had done it (sentBackFrom).
const sentBack = sql`(${item.sendBackCount} > 0 AND ${item.isNotApplicable} = 0)`
const ruleScored = sql`(${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND (${boolScored} OR ${textScored} OR ${numScored}))`

const scoredExpr = sql<number>`SUM(CASE WHEN ${sentBack} THEN 1 WHEN ${ruleScored} THEN 1 ELSE 0 END)`
const goodExpr = sql<number>`SUM(CASE
    WHEN ${sentBack} THEN 0
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${boolScored} AND JSON_CONTAINS(${item.acceptableAnswers}, JSON_QUOTE(${item.booleanAnswer})) THEN 1
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${textScored} AND JSON_CONTAINS(${item.acceptableAnswers}, JSON_QUOTE(${item.textValue})) THEN 1
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${numScored}
        AND (${item.acceptableMin} IS NULL OR ${item.numericValue} >= ${item.acceptableMin})
        AND (${item.acceptableMax} IS NULL OR ${item.numericValue} <= ${item.acceptableMax}) THEN 1
    ELSE 0 END)`

// A critical question counts double in Compliance %: weighted twins of scoredExpr/goodExpr above
// (Answers checked stays the raw count).
const weightExpr = sql`(CASE WHEN ${item.isCritical} = 1 THEN 2 ELSE 1 END)`
export const weightedScoredExpr = sql<number>`SUM(CASE WHEN ${sentBack} THEN ${weightExpr} WHEN ${ruleScored} THEN ${weightExpr} ELSE 0 END)`
export const weightedGoodExpr = sql<number>`SUM(CASE
    WHEN ${sentBack} THEN 0
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${boolScored} AND JSON_CONTAINS(${item.acceptableAnswers}, JSON_QUOTE(${item.booleanAnswer})) THEN ${weightExpr}
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${textScored} AND JSON_CONTAINS(${item.acceptableAnswers}, JSON_QUOTE(${item.textValue})) THEN ${weightExpr}
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${numScored}
        AND (${item.acceptableMin} IS NULL OR ${item.numericValue} >= ${item.acceptableMin})
        AND (${item.acceptableMax} IS NULL OR ${item.numericValue} <= ${item.acceptableMax}) THEN ${weightExpr}
    ELSE 0 END)`

// Who a question is credited to: whoever completed it, except a sent-back question, which is credited
// (as a failure) to the person who had done it when it was sent back.
const creditedUser = sql<string | null>`(CASE WHEN ${item.sendBackCount} > 0 AND ${item.sentBackFrom} IS NOT NULL THEN ${item.sentBackFrom} ELSE ${item.completedBy} END)`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null)

type RunRow = {
    id: string
    periodStart: Date
    periodEnd: Date
    cutoffTime: string | null
    opensTime: string | null
    verificationStatus: string
    rejectionCount: number
    submittedAt: Date | null
    total: number
    done: number
    lastDoneAt: Date | null
}

type RunFlags = { complete: boolean; onTime: boolean; missed: boolean; submitted: boolean; approved: boolean; sentBack: boolean }

const emptyRunAcc = () => ({ assigned: 0, completed: 0, onTime: 0, missed: 0, submitted: 0, approved: 0, sentBack: 0 })
type RunAcc = ReturnType<typeof emptyRunAcc>
const emptyItemAcc = () => ({ done: 0, na: 0, scored: 0, good: 0, wScored: 0, wGood: 0 })
type ItemAcc = ReturnType<typeof emptyItemAcc>

const addRun = (acc: RunAcc, f: RunFlags) => {
    acc.assigned += 1
    if (f.complete) acc.completed += 1
    if (f.onTime) acc.onTime += 1
    if (f.missed) acc.missed += 1
    if (f.submitted) acc.submitted += 1
    if (f.approved) acc.approved += 1
    if (f.sentBack) acc.sentBack += 1
}

const addItems = (into: ItemAcc, from: ItemAcc) => {
    into.done += from.done
    into.na += from.na
    into.scored += from.scored
    into.good += from.good
    into.wScored += from.wScored
    into.wGood += from.wGood
}

const toMetrics = (r: RunAcc, i: ItemAcc): ReportMetrics => ({
    assigned: r.assigned,
    completed: r.completed,
    completionPct: pct(r.completed, r.assigned),
    onTime: r.onTime,
    onTimePct: pct(r.onTime, r.assigned),
    missed: r.missed,
    submitted: r.submitted,
    approved: r.approved,
    sentBack: r.sentBack,
    questionsDone: i.done,
    notApplicable: i.na,
    answersChecked: i.scored,
    compliancePct: pct(i.wGood, i.wScored),
})

// Worst completion first so the people who need a conversation are at the top; a missing
// percentage (nothing assigned) sorts last.
const byCompletionThenName = (a: { completionPct: number | null }, b: { completionPct: number | null }, an: string, bn: string) =>
    (a.completionPct ?? 101) - (b.completionPct ?? 101) || an.localeCompare(bn)

const resolveDepartmentScope = (user: AccessTokenPayload, requested?: string): { departmentId?: string; locked: boolean } => {
    if (user.role === "ADMIN" || user.role === "PC") return { departmentId: requested, locked: false }
    if (user.role === "MANAGER" || user.role === "SENIOR") {
        // No department on the record means no people to show, not "everyone": this id matches nothing.
        return { departmentId: user.departmentId ?? "no-department", locked: true }
    }
    throw AppError.forbidden()
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export const checklistReportService = {
    /**
     * `onlyUserId` narrows the report to one person's runs and answers. It skips the role check, so the
     * caller (the scores module) must already have decided the viewer may see that person.
     */
    async build(
        user: AccessTokenPayload,
        query: Pick<ChecklistReportQuery, "from" | "to" | "storeId" | "departmentId" | "groupBy">,
        onlyUserId?: string,
    ): Promise<ChecklistReport> {
        const { departmentId, locked } = onlyUserId ? { departmentId: undefined, locked: false } : resolveDepartmentScope(user, query.departmentId)
        const { from, to, storeId, groupBy } = query
        const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
        const now = Date.now()

        // Runs in range, minus soft-deleted checklists, minus other stores. With a department filter
        // only runs that have someone from that department assigned matter, which keeps the item
        // pass below small for a department head.
        const runConditions = [
            gte(checklistInstances.periodStart, new Date(`${from}T00:00:00.000Z`)),
            lte(checklistInstances.periodStart, new Date(`${to}T00:00:00.000Z`)),
            parentNotDeletedExpr,
        ]
        if (storeId) runConditions.push(eq(checklistInstances.storeId, storeId))
        if (onlyUserId) {
            runConditions.push(sql`EXISTS (
                SELECT 1 FROM ${checklistInstanceAssignees} a3
                WHERE a3.instanceId = ${checklistInstances.id} AND a3.userId = ${onlyUserId}
            )`)
        }
        if (departmentId) {
            runConditions.push(sql`EXISTS (
                SELECT 1 FROM ${checklistInstanceAssignees} a2
                INNER JOIN ${users} u2 ON u2.id = a2.userId
                WHERE a2.instanceId = ${checklistInstances.id} AND u2.departmentId = ${departmentId}
            )`)
        }
        const runWhere = and(...runConditions)

        const [runRows, assigneeRows, itemRows, departmentRows, storeRows] = await Promise.all([
            // One row per run, items folded into counts.
            db.select({
                id: checklistInstances.id,
                periodStart: checklistInstances.periodStart,
                periodEnd: checklistInstances.periodEnd,
                cutoffTime: checklistInstances.cutoffTime,
                opensTime: checklistInstances.opensTime,
                verificationStatus: checklistInstances.verificationStatus,
                rejectionCount: checklistInstances.rejectionCount,
                submittedAt: checklistInstances.submittedAt,
                total: sql<number>`COUNT(${item.id})`,
                done: sql<number>`COALESCE(SUM(${item.isDone}), 0)`,
                lastDoneAt: sql<Date | null>`MAX(${item.completedAt})`.mapWith(item.completedAt),
            })
                .from(checklistInstances)
                .leftJoin(item, eq(item.instanceId, checklistInstances.id))
                .where(runWhere)
                .groupBy(
                    checklistInstances.id, checklistInstances.periodStart, checklistInstances.periodEnd, checklistInstances.cutoffTime,
                    checklistInstances.opensTime, checklistInstances.verificationStatus, checklistInstances.rejectionCount, checklistInstances.submittedAt,
                ),
            // Who each run belongs to, with the person's details, so there is no per-person lookup.
            db.select({
                instanceId: checklistInstanceAssignees.instanceId,
                userId: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                role: users.role,
                departmentId: users.departmentId,
                storeId: users.storeId,
                isActive: users.isActive,
            })
                .from(checklistInstanceAssignees)
                .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
                .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
                .where(and(runWhere, departmentId ? eq(users.departmentId, departmentId) : undefined, onlyUserId ? eq(users.id, onlyUserId) : undefined)),
            // Item-level numbers by the person who completed each question.
            db.select({
                userId: creditedUser,
                done: sql<number>`SUM(CASE WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 THEN 1 ELSE 0 END)`,
                na: sql<number>`SUM(CASE WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 1 THEN 1 ELSE 0 END)`,
                scored: scoredExpr,
                good: goodExpr,
                wScored: weightedScoredExpr,
                wGood: weightedGoodExpr,
            })
                .from(item)
                .innerJoin(checklistInstances, eq(checklistInstances.id, item.instanceId))
                .where(and(runWhere, sql`((${item.isDone} = 1 AND ${item.completedBy} IS NOT NULL) OR ${item.sendBackCount} > 0)`))
                .groupBy(creditedUser),
            db.select({ id: departments.id, name: departments.name }).from(departments),
            db.select({ id: stores.id, name: stores.name }).from(stores),
        ])

        const departmentNames = new Map(departmentRows.map((d) => [d.id, d.name]))
        const storeNames = new Map(storeRows.map((s) => [s.id, s.name]))

        // Deadline = periodStart (the org-local day as UTC midnight) + cutoff clock time - org offset.
        // An overnight window (cutoff earlier than opens) rolls to the next day. No cutoff = end of day.
        const flagsOf = (r: RunRow): RunFlags => {
            const total = Number(r.total)
            const complete = total > 0 && Number(r.done) === total
            let deadline: number
            if (!r.cutoffTime) {
                deadline = r.periodEnd.getTime() - offsetMs
            } else {
                const [h, m] = r.cutoffTime.split(":").map(Number)
                let minutes = h * 60 + m
                if (r.opensTime && r.cutoffTime < r.opensTime) minutes += 24 * 60
                deadline = r.periodStart.getTime() + minutes * 60_000 - offsetMs
            }
            const status = r.verificationStatus
            return {
                complete,
                onTime: complete && (!r.lastDoneAt || r.lastDoneAt.getTime() <= deadline),
                missed: !complete && now > deadline,
                submitted: r.submittedAt != null || status === "PENDING_APPROVAL" || status === "APPROVED",
                approved: status === "APPROVED",
                sentBack: r.rejectionCount > 0,
            }
        }
        const flagsByRun = new Map<string, RunFlags>(runRows.map((r) => [r.id, flagsOf(r)]))

        type Person = { row: (typeof assigneeRows)[number]; runs: RunAcc; items: ItemAcc }
        const peopleById = new Map<string, Person>()
        type Dept = { runs: RunAcc; items: ItemAcc; runIds: Set<string>; people: Set<string> }
        const deptByKey = new Map<string, Dept>()

        for (const a of assigneeRows) {
            const flags = flagsByRun.get(a.instanceId)
            if (!flags) continue
            let person = peopleById.get(a.userId)
            if (!person) {
                person = { row: a, runs: emptyRunAcc(), items: emptyItemAcc() }
                peopleById.set(a.userId, person)
            }
            addRun(person.runs, flags)

            const key = a.departmentId ?? NO_DEPARTMENT_KEY
            let dept = deptByKey.get(key)
            if (!dept) {
                dept = { runs: emptyRunAcc(), items: emptyItemAcc(), runIds: new Set(), people: new Set() }
                deptByKey.set(key, dept)
            }
            dept.people.add(a.userId)
            // A run shared by two people of one department counts once for that department.
            if (!dept.runIds.has(a.instanceId)) {
                dept.runIds.add(a.instanceId)
                addRun(dept.runs, flags)
            }
        }

        // Questions are credited to whoever completed them, but only people who appear in the
        // report (they had a checklist assigned in the period) get a row to show them on.
        for (const r of itemRows) {
            const person = r.userId ? peopleById.get(r.userId) : undefined
            if (!person) continue
            const acc: ItemAcc = { done: Number(r.done), na: Number(r.na), scored: Number(r.scored), good: Number(r.good), wScored: Number(r.wScored), wGood: Number(r.wGood) }
            addItems(person.items, acc)
            addItems(deptByKey.get(person.row.departmentId ?? NO_DEPARTMENT_KEY)!.items, acc)
        }

        const wantPeople = groupBy === "person" || groupBy === "both"
        const wantDepartments = groupBy === "department" || groupBy === "both"

        const people: PersonRow[] = wantPeople
            ? [...peopleById.values()].map((p): PersonRow => ({
                userId: p.row.userId,
                name: `${p.row.firstName} ${p.row.lastName ?? ""}`.trim(),
                role: p.row.role,
                department: p.row.departmentId ? departmentNames.get(p.row.departmentId) ?? NO_DEPARTMENT_LABEL : NO_DEPARTMENT_LABEL,
                store: p.row.storeId ? storeNames.get(p.row.storeId) ?? "" : "",
                status: p.row.isActive ? "Active" : "Left",
                ...toMetrics(p.runs, p.items),
            })).sort((a, b) => byCompletionThenName(a, b, a.name, b.name))
            : []

        const departmentsOut: DepartmentRow[] = wantDepartments
            ? [...deptByKey.entries()].map(([key, d]): DepartmentRow => ({
                departmentId: key === NO_DEPARTMENT_KEY ? null : key,
                department: key === NO_DEPARTMENT_KEY ? NO_DEPARTMENT_LABEL : departmentNames.get(key) ?? NO_DEPARTMENT_LABEL,
                people: d.people.size,
                ...toMetrics(d.runs, d.items),
            })).sort((a, b) => byCompletionThenName(a, b, a.department, b.department))
            : []

        return {
            from,
            to,
            generatedAt: new Date().toISOString(),
            storeName: storeId ? storeNames.get(storeId) ?? null : null,
            departmentName: departmentId ? departmentNames.get(departmentId) ?? null : null,
            departmentLocked: locked,
            people,
            departments: departmentsOut,
            notes: REPORT_NOTES,
        }
    },
}

// ---------------------------------------------------------------------------
// Export columns and writers
// ---------------------------------------------------------------------------

type ColumnDef = CsvColumn & { width: number; tone?: boolean }

const METRIC_COLUMNS: ColumnDef[] = [
    { key: "assigned", label: "Checklists assigned", width: 12 },
    { key: "completed", label: "Completed", width: 12 },
    { key: "completionPct", label: "Completion %", width: 12, tone: true },
    { key: "onTime", label: "Completed on time", width: 12 },
    { key: "onTimePct", label: "On-time %", width: 11, tone: true },
    { key: "missed", label: "Missed", width: 10 },
    { key: "submitted", label: "Submitted", width: 11 },
    { key: "approved", label: "Approved", width: 11 },
    { key: "sentBack", label: "Sent back", width: 11 },
    { key: "questionsDone", label: "Questions done", width: 12 },
    { key: "notApplicable", label: "Not applicable", width: 12 },
    { key: "answersChecked", label: "Answers checked", width: 12 },
    { key: "compliancePct", label: "Compliance %", width: 12, tone: true },
]

export const PERSON_COLUMNS: ColumnDef[] = [
    { key: "name", label: "Name", width: 26 },
    { key: "role", label: "Role", width: 12 },
    { key: "department", label: "Department", width: 22 },
    { key: "store", label: "Store", width: 22 },
    { key: "status", label: "Status", width: 10 },
    ...METRIC_COLUMNS,
]

export const DEPARTMENT_COLUMNS: ColumnDef[] = [
    { key: "department", label: "Department", width: 26 },
    { key: "people", label: "People", width: 10 },
    ...METRIC_COLUMNS,
]

const exportColumns = (grouping: "person" | "department") => (grouping === "department" ? DEPARTMENT_COLUMNS : PERSON_COLUMNS)

// CSV is one table, so "both" falls back to people.
export const csvGrouping = (groupBy: ChecklistReportGrouping): "person" | "department" => (groupBy === "department" ? "department" : "person")

export const streamReportCsv = async (res: Response, report: ChecklistReport, grouping: "person" | "department") => {
    const rows: Record<string, unknown>[] = grouping === "department" ? report.departments : report.people
    async function* iterate() {
        for (const row of rows) yield row
    }
    await streamCsv(res, iterate(), exportColumns(grouping))
}

const TONE_FILL = { good: "FFD1FAE5", warn: "FFFEF3C7", bad: "FFFEE2E2" } as const
// Same cut-offs as rateToneClass in the client (80 and 50).
const toneFor = (value: number) => (value >= 80 ? TONE_FILL.good : value >= 50 ? TONE_FILL.warn : TONE_FILL.bad)

const addSheet = (
    workbook: ExcelJS.Workbook,
    name: string,
    title: string,
    report: ChecklistReport,
    columns: ColumnDef[],
    rows: Record<string, unknown>[],
) => {
    const sheet = workbook.addWorksheet(name)
    columns.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width })

    const generated = new Date(report.generatedAt)
    const generatedLocal = new Date(generated.getTime() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
        .toISOString().slice(0, 16).replace("T", " ")
    sheet.addRow([title]).font = { bold: true, size: 14 }
    sheet.addRow([`Period: ${report.from} to ${report.to}`])
    sheet.addRow([`Store: ${report.storeName ?? "All stores"}    Department: ${report.departmentName ?? "All departments"}`])
    sheet.addRow([`Generated: ${generatedLocal}`])
    sheet.addRow([])

    const headerRow = sheet.addRow(columns.map((c) => c.label))
    headerRow.font = { bold: true }
    headerRow.alignment = { vertical: "middle", wrapText: true }
    headerRow.height = 32
    headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }
        cell.border = { bottom: { style: "thin" } }
    })
    sheet.views = [{ state: "frozen", ySplit: headerRow.number, xSplit: 1 }]

    for (const row of rows) {
        const excelRow = sheet.addRow(columns.map((c) => row[c.key] ?? null))
        columns.forEach((c, i) => {
            if (!c.tone) return
            const value = row[c.key]
            if (typeof value === "number") excelRow.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: toneFor(value) } }
        })
    }
    if (!rows.length) sheet.addRow(["No checklists ran in this period"])

    sheet.addRow([])
    sheet.addRow(["Notes"]).font = { bold: true }
    for (const note of report.notes) sheet.addRow([note])
}

export const writeReportXlsx = async (res: Response, report: ChecklistReport, groupBy: ChecklistReportGrouping) => {
    const workbook = new ExcelJS.Workbook()
    workbook.created = new Date(report.generatedAt)
    if (groupBy === "person" || groupBy === "both") {
        addSheet(workbook, "People", "Checklist Completion and Compliance Report: People", report, PERSON_COLUMNS, report.people as unknown as Record<string, unknown>[])
    }
    if (groupBy === "department" || groupBy === "both") {
        addSheet(workbook, "Departments", "Checklist Completion and Compliance Report: Departments", report, DEPARTMENT_COLUMNS, report.departments as unknown as Record<string, unknown>[])
    }
    await workbook.xlsx.write(res)
    res.end()
}
