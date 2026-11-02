import { readTable } from "../../utils/readTable.js"
import { MAX_TAT_HOURS } from "../../utils/tatLimits.js"
import { matchExactOrFuzzy, type MatchConfidence } from "../../utils/fuzzyMatch.js"
import { AppError } from "../../utils/AppError.js"
import { categoryService } from "./category.service.js"
import { userService } from "../users/user.service.js"
import { departmentService } from "../departments/department.service.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"

export const NAME_COLUMN_CHOICES = ["Sub Category (Filled)", "Category (Refined)", "Category", "Sub Category", "Category Name", "Name"] as const

const SLA_COLUMNS = ["sla (min)", "sla", "sla minutes"]
const PERSON_COLUMNS = ["completed by (claimed by)", "completed by", "assignee", "person"]
const DEPARTMENT_COLUMNS = ["store / department", "department", "dept"]
const UNUSABLE_NAMES = new Set(["not set in source", "unclear request (no detail in source)", "n/a", "na", "-"])

export type HistoryPerson = { id: string; name: string; email: string; departmentId: string | null }
export type HistoryDepartment = { id: string; name: string }

export type CategoryProposal = {
    key: string
    name: string
    rowCount: number
    tatHours: number | null
    personName: string | null
    assigneeId: string | null
    departmentId: string | null
    departmentSource: "person" | "column" | "none"
    departmentMatch: MatchConfidence
    exists: boolean
}

const squash = (value: string) => value.trim().replace(/\s+/g, " ")
const keyOf = (value: string) => squash(value).toLowerCase()

const findColumn = (headers: string[], wanted: readonly string[]): string | null =>
    headers.find((h) => wanted.includes(h.trim().toLowerCase())) ?? null

const modeOf = <T,>(values: T[]): T | null => {
    const counts = new Map<T, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    let best: T | null = null
    let bestCount = 0
    for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c }
    return best
}

export const hoursFromSlaMinutes = (raw: string): number | null => {
    const minutes = Number(raw)
    if (!Number.isFinite(minutes) || minutes <= 0) return null
    const hours = Math.max(1, Math.round(minutes / 60))
    return hours > MAX_TAT_HOURS ? null : hours
}

const peopleIn = (cell: string): string[] => cell.split(/[,;&]|\sand\s/i).map(squash).filter(Boolean)

export const buildCategoryProposals = (
    records: Record<string, string>[],
    nameColumn: string,
    ctx: { people: HistoryPerson[]; departments: HistoryDepartment[]; existingNames: Set<string> },
): CategoryProposal[] => {
    const headers = records.length ? Object.keys(records[0]!) : []
    const slaColumn = findColumn(headers, SLA_COLUMNS)
    const personColumn = findColumn(headers, PERSON_COLUMNS)
    const departmentColumn = findColumn(headers, DEPARTMENT_COLUMNS)

    const groups = new Map<string, { name: string; sla: number[]; people: string[]; departments: string[]; rows: number }>()
    for (const record of records) {
        const name = squash(record[nameColumn] ?? "")
        if (!name || UNUSABLE_NAMES.has(name.toLowerCase())) continue
        const key = keyOf(name)
        const group = groups.get(key) ?? { name, sla: [], people: [], departments: [], rows: 0 }
        group.rows += 1
        if (slaColumn) {
            const hours = hoursFromSlaMinutes(record[slaColumn] ?? "")
            if (hours !== null) group.sla.push(hours)
        }
        if (personColumn) group.people.push(...peopleIn(record[personColumn] ?? ""))
        if (departmentColumn) {
            const department = squash(record[departmentColumn] ?? "")
            if (department) group.departments.push(department)
        }
        groups.set(key, group)
    }

    const proposals: CategoryProposal[] = []
    for (const [key, group] of groups) {
        const topPerson = modeOf(group.people)
        const person = topPerson ? matchExactOrFuzzy(topPerson, ctx.people, (p) => p.name).match : null

        let departmentId: string | null = null
        let departmentSource: CategoryProposal["departmentSource"] = "none"
        let departmentMatch: MatchConfidence = "none"
        if (person?.departmentId) {
            departmentId = person.departmentId
            departmentSource = "person"
            departmentMatch = "exact"
        } else {
            const topDepartment = modeOf(group.departments)
            const found = topDepartment ? matchExactOrFuzzy(topDepartment, ctx.departments, (d) => d.name) : null
            if (found?.match) {
                departmentId = found.match.id
                departmentSource = "column"
                departmentMatch = found.confidence
            }
        }

        proposals.push({
            key,
            name: group.name,
            rowCount: group.rows,
            tatHours: modeOf(group.sla),
            personName: topPerson,
            assigneeId: person?.id ?? null,
            departmentId,
            departmentSource,
            departmentMatch,
            exists: ctx.existingNames.has(key),
        })
    }
    return proposals.sort((a, b) => b.rowCount - a.rowCount || a.name.localeCompare(b.name))
}

export const categoryHistoryImportService = {
    async preview(buffer: Buffer, mimetype: string, requestedColumn: string | undefined, actor: AccessTokenPayload) {
        const records = await readTable(buffer, mimetype)
        if (!records.length) throw AppError.unprocessable("No rows were found in this file.")
        const headers = Object.keys(records[0]!)
        const available = NAME_COLUMN_CHOICES.filter((choice) => headers.some((h) => h.trim().toLowerCase() === choice.toLowerCase()))
            .map((choice) => headers.find((h) => h.trim().toLowerCase() === choice.toLowerCase())!)
        if (!available.length) {
            throw AppError.unprocessable("Couldn't find a category column. The file needs a column named Category, Sub Category (Filled) or Category (Refined).")
        }
        const nameColumn = requestedColumn && available.includes(requestedColumn) ? requestedColumn : available[0]!

        const [assignable, { data: departments }, existing] = await Promise.all([
            userService.listAssignable(actor),
            departmentService.list(),
            categoryService.list(),
        ])
        const people: HistoryPerson[] = assignable.map((u) => ({
            id: u.id,
            name: `${u.firstName} ${u.lastName ?? ""}`.trim(),
            email: u.email,
            departmentId: u.departmentId ?? null,
        }))
        const departmentList: HistoryDepartment[] = departments.map((d) => ({ id: d.id, name: d.name }))
        const existingNames = new Set(existing.map((c) => keyOf(c.name)))

        return {
            columns: available,
            nameColumn,
            totalRows: records.length,
            proposals: buildCategoryProposals(records, nameColumn, { people, departments: departmentList, existingNames }),
            departments: departmentList,
            people: people.map((p) => ({ id: p.id, name: p.name, email: p.email })),
        }
    },
}
