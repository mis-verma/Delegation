import { readTable } from "../../utils/readTable.js"
import { MAX_TAT_HOURS } from "../../utils/tatLimits.js"
import { matchExactOrFuzzy, type MatchConfidence } from "../../utils/fuzzyMatch.js"
import { db } from "../../config/db.js"
import { tags } from "../../db/schema/task.js"
import { asc } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { isDepartmentHeadRole } from "../../utils/roles.js"
import { categoryService } from "./category.service.js"
import { userService } from "../users/user.service.js"
import { departmentService } from "../departments/department.service.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"

export const NAME_COLUMN_CHOICES = ["Sub Category (Filled)", "Category (Refined)", "Category", "Sub Category", "Category Name", "Name"] as const

const SLA_COLUMNS = ["sla (min)", "sla", "sla minutes"]
const HOURS_COLUMNS = ["due hours", "due time (hours)", "tat hours", "tat (hours)", "hours"]
const PERSON_COLUMNS = ["completed by (claimed by)", "completed by", "assignee", "assigned to", "person", "person email", "assignee email", "email"]
const DEPARTMENT_COLUMNS = ["store / department", "department", "department name", "dept", "team"]
const SUBCATEGORY_COLUMNS = ["sub category", "subcategory", "sub-category"]
const LABEL_COLUMNS = ["labels", "label", "tags"]
const PRIORITY_COLUMNS = ["priority", "usual priority"]
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const
const MAX_LABELS = 12
const UNUSABLE_NAMES = new Set(["not set in source", "unclear request (no detail in source)", "n/a", "na", "-"])

export type HistoryPerson = { id: string; name: string; email: string; departmentId: string | null; role?: string }
export type HistoryDepartment = { id: string; name: string }
export type HistoryTag = { id: string; name: string }
export type HistoryExisting = { id: string; subcategoryKeys: Set<string> }
export type CategoryPriorityValue = (typeof PRIORITIES)[number]

export type CategoryProposalSubcategory = {
    name: string
    exists: boolean
    tatHours: number | null
    priority: CategoryPriorityValue | null
    labels: { name: string; tagId: string | null }[]
    personName: string | null
    assigneeId: string | null
    assigneeSource: "column" | "head" | "none"
    departmentName: string | null
    departmentId: string | null
}

export type CategoryProposal = {
    key: string
    name: string
    rowCount: number
    tatHours: number | null
    personName: string | null
    assigneeId: string | null
    assigneeSource: "column" | "head" | "none"
    departmentId: string | null
    departmentText: string | null
    departmentSource: "person" | "column" | "none"
    departmentMatch: MatchConfidence
    exists: boolean
    existingCategoryId: string | null
    subcategories: CategoryProposalSubcategory[]
    priority: CategoryPriorityValue | null
    labels: { name: string; tagId: string | null }[]
    warnings: string[]
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

export const hoursFromHours = (raw: string): number | null => {
    const hours = Number(raw)
    if (!Number.isFinite(hours) || hours <= 0) return null
    const whole = Math.max(1, Math.round(hours))
    return whole > MAX_TAT_HOURS ? null : whole
}

export const hoursFromSlaMinutes = (raw: string): number | null => {
    const minutes = Number(raw)
    if (!Number.isFinite(minutes) || minutes <= 0) return null
    const hours = Math.max(1, Math.round(minutes / 60))
    return hours > MAX_TAT_HOURS ? null : hours
}

export const priorityFrom = (raw: string): CategoryPriorityValue | null => {
    const value = raw.trim().toUpperCase()
    return (PRIORITIES as readonly string[]).includes(value) ? (value as CategoryPriorityValue) : null
}

const PARENT_COLUMNS = ["category", "category name"]

const DERIVED_LABELS: { label: string; pattern: RegExp }[] = [
    { label: "Networking", pattern: /\b(internet|wi-?fi|lan|network(ing)?|router|vpn|phone|intercom|ivr|dialer|sim)\b/i },
]

export const derivedLabelsFor = (name: string): string[] => DERIVED_LABELS.filter((rule) => rule.pattern.test(name)).map((rule) => rule.label)

export const pickNameColumn = (records: Record<string, string>[], available: string[]): string => {
    const lower = (header: string) => header.trim().toLowerCase()
    const parent = available.find((h) => PARENT_COLUMNS.includes(lower(h)))
    const child = available.find((h) => SUBCATEGORY_COLUMNS.includes(lower(h)))
    if (parent && child) {
        const distinct = (column: string) => new Set(records.map((r) => keyOf(r[column] ?? "")).filter(Boolean)).size
        if (distinct(parent) <= 1 && distinct(child) > 1) return child
    }
    return available[0]!
}

const labelsIn = (cell: string): string[] => cell.split(/[,;|]/).map(squash).filter(Boolean)

const matchTag = (label: string, tags: HistoryTag[]): string | null => tags.find((tag) => keyOf(tag.name) === keyOf(label))?.id ?? null

const peopleIn = (cell: string): string[] => cell.split(/[,;&]|\sand\s/i).map(squash).filter(Boolean)

export const buildCategoryProposals = (
    records: Record<string, string>[],
    nameColumn: string,
    ctx: {
        people: HistoryPerson[]
        departments: HistoryDepartment[]
        existingNames: Set<string>
        existing?: Map<string, HistoryExisting>
        tags?: HistoryTag[]
        heads?: ReadonlyMap<string, HistoryPerson>
    },
): CategoryProposal[] => {
    const headers = records.length ? Object.keys(records[0]!) : []
    const slaColumn = findColumn(headers, SLA_COLUMNS)
    const hoursColumn = findColumn(headers, HOURS_COLUMNS)
    const personColumn = findColumn(headers, PERSON_COLUMNS)
    const departmentColumn = findColumn(headers, DEPARTMENT_COLUMNS)
    const nameIsCategory = ["category", "category name", "name"].includes(nameColumn.trim().toLowerCase())
    const subcategoryColumn = nameIsCategory ? findColumn(headers, SUBCATEGORY_COLUMNS) : null
    const labelColumn = findColumn(headers, LABEL_COLUMNS)
    const nameIsSubcategory = SUBCATEGORY_COLUMNS.includes(nameColumn.trim().toLowerCase())
    const parentColumn = nameIsSubcategory ? findColumn(headers, PARENT_COLUMNS) : null
    const priorityColumn = findColumn(headers, PRIORITY_COLUMNS)
    const listFormat = !!(subcategoryColumn || labelColumn || priorityColumn || hoursColumn)

    type SubRow = { hours: number | null; priority: string; labels: string[]; person: string; department: string }
    type Group = {
        name: string
        sla: number[]
        people: string[]
        departments: string[]
        priorities: CategoryPriorityValue[]
        badPriorities: Set<string>
        labels: Map<string, string>
        subcategories: Map<string, string>
        subRows: Map<string, SubRow>
        rowHours: (number | null)[]
        rowLabelKeys: Set<string>[]
        rows: number
    }
    const groups = new Map<string, Group>()
    for (const record of records) {
        const name = squash(record[nameColumn] ?? "")
        if (!name || UNUSABLE_NAMES.has(name.toLowerCase())) continue
        const key = keyOf(name)
        const group: Group = groups.get(key) ?? {
            name,
            sla: [],
            people: [],
            departments: [],
            priorities: [],
            badPriorities: new Set<string>(),
            labels: new Map<string, string>(),
            subcategories: new Map<string, string>(),
            subRows: new Map<string, SubRow>(),
            rowHours: [],
            rowLabelKeys: [],
            rows: 0,
        }
        group.rows += 1
        const hours = hoursColumn ? hoursFromHours(record[hoursColumn] ?? "") : slaColumn ? hoursFromSlaMinutes(record[slaColumn] ?? "") : null
        if (hours !== null) group.sla.push(hours)
        group.rowHours.push(hours)
        const rowLabels = labelColumn ? labelsIn(record[labelColumn] ?? "") : []
        group.rowLabelKeys.push(new Set(rowLabels.map(keyOf)))
        if (personColumn) group.people.push(...peopleIn(record[personColumn] ?? ""))
        if (departmentColumn) {
            const department = squash(record[departmentColumn] ?? "")
            if (department) group.departments.push(department)
        }
        if (subcategoryColumn) {
            const subcategory = squash(record[subcategoryColumn] ?? "")
            if (subcategory && !UNUSABLE_NAMES.has(subcategory.toLowerCase()) && !group.subcategories.has(keyOf(subcategory))) {
                group.subcategories.set(keyOf(subcategory), subcategory)
                group.subRows.set(keyOf(subcategory), {
                    hours,
                    priority: priorityColumn ? squash(record[priorityColumn] ?? "") : "",
                    labels: rowLabels,
                    person: personColumn ? peopleIn(record[personColumn] ?? "")[0] ?? "" : "",
                    department: departmentColumn ? squash(record[departmentColumn] ?? "") : "",
                })
            }
        }
        if (priorityColumn) {
            const raw = squash(record[priorityColumn] ?? "")
            if (raw) {
                const priority = priorityFrom(raw)
                if (priority) group.priorities.push(priority)
                else group.badPriorities.add(raw)
            }
        }
        const parentName = parentColumn ? squash(record[parentColumn] ?? "") : ""
        if (parentName && !group.labels.has(keyOf(parentName))) group.labels.set(keyOf(parentName), parentName)
        for (const derived of derivedLabelsFor(name)) if (!group.labels.has(keyOf(derived))) group.labels.set(keyOf(derived), derived)
        if (labelColumn) {
            for (const label of labelsIn(record[labelColumn] ?? "")) {
                if (!group.labels.has(keyOf(label))) group.labels.set(keyOf(label), label)
            }
        }
        groups.set(key, group)
    }

    const proposals: CategoryProposal[] = []
    for (const [key, group] of groups) {
        const topPerson = modeOf(group.people)
        const person = topPerson
            ? ctx.people.find((p) => p.email.toLowerCase() === topPerson.toLowerCase()) ?? matchExactOrFuzzy(topPerson, ctx.people, (p) => p.name).match
            : null

        let departmentId: string | null = null
        let departmentSource: CategoryProposal["departmentSource"] = "none"
        let departmentMatch: MatchConfidence = "none"
        const topDepartmentName = modeOf(group.departments)
        const columnDepartment = listFormat && topDepartmentName ? matchExactOrFuzzy(topDepartmentName, ctx.departments, (d) => d.name) : null
        if (columnDepartment?.confidence === "exact" && columnDepartment.match) {
            departmentId = columnDepartment.match.id
            departmentSource = "column"
            departmentMatch = "exact"
        } else if (person?.departmentId) {
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

        const head = !person && departmentId ? ctx.heads?.get(departmentId) ?? null : null
        const found = ctx.existing?.get(key)
        const warnings: string[] = []
        if (!person && departmentId && ctx.heads && !head) warnings.push("This department has no head, so nobody is assigned by default.")
        const perRow = listFormat && group.subcategories.size > 1
        if (!perRow) for (const bad of group.badPriorities) warnings.push(`Priority "${bad}" is not Low, Medium, High or Critical, so it was left empty.`)
        if (topPerson && !person) warnings.push(`No active person matches "${topPerson}".`)
        const sharedLabelKeys = perRow ? group.rowLabelKeys.reduce<Set<string> | null>((acc, keys) => acc ? new Set([...acc].filter((k) => keys.has(k))) : new Set(keys), null) : null
        const labels = [...group.labels.entries()]
            .filter(([labelKey]) => !sharedLabelKeys || sharedLabelKeys.has(labelKey))
            .map(([, label]) => ({ name: label, tagId: matchTag(label, ctx.tags ?? []) }))
        if (labels.length > MAX_LABELS) warnings.push(`Only the first ${MAX_LABELS} labels are used.`)

        const subcategories: CategoryProposalSubcategory[] = [...group.subcategories.entries()].map(([subKey, subName]) => {
            const exists = found?.subcategoryKeys.has(subKey) ?? false
            const row = group.subRows.get(subKey)
            if (!perRow || !row) return { name: subName, exists, tatHours: null, priority: null, labels: [], personName: null, assigneeId: null, assigneeSource: "none", departmentName: null, departmentId: null }
            let rowDepartmentId: string | null = null
            if (row.department) {
                const hit = matchExactOrFuzzy(row.department, ctx.departments, (d) => d.name)
                if (hit.confidence === "exact" && hit.match) rowDepartmentId = hit.match.id
                else warnings.push(`Row "${subName}": department "${row.department}" is not an existing department, so it uses the category's department.`)
            }
            let rowPerson: HistoryPerson | null = null
            if (row.person) {
                rowPerson = ctx.people.find((p) => p.email.toLowerCase() === row.person.toLowerCase()) ?? matchExactOrFuzzy(row.person, ctx.people, (p) => p.name).match
                if (!rowPerson) warnings.push(`Row "${subName}": no active person matches "${row.person}".`)
            }
            const rowHead = !rowPerson ? ctx.heads?.get(rowDepartmentId ?? departmentId ?? "") ?? null : null
            let rowPriority: CategoryPriorityValue | null = null
            if (row.priority) {
                rowPriority = priorityFrom(row.priority)
                if (!rowPriority) warnings.push(`Row "${subName}": priority "${row.priority}" is not Low, Medium, High or Critical, so it was left empty.`)
            }
            return {
                name: subName,
                exists,
                tatHours: row.hours,
                priority: rowPriority,
                labels: row.labels.map((label) => ({ name: label, tagId: matchTag(label, ctx.tags ?? []) })),
                personName: row.person || rowHead?.name || null,
                assigneeId: rowPerson?.id ?? rowHead?.id ?? null,
                assigneeSource: rowPerson ? "column" : rowHead ? "head" : "none",
                departmentName: row.department || null,
                departmentId: rowDepartmentId,
            }
        })

        proposals.push({
            key,
            name: group.name,
            rowCount: group.rows,
            tatHours: perRow && group.rowHours.some((h) => h === null) ? null : modeOf(group.sla),
            personName: topPerson ?? head?.name ?? null,
            assigneeId: person?.id ?? head?.id ?? null,
            assigneeSource: person ? "column" : head ? "head" : "none",
            departmentId,
            departmentText: topDepartmentName,
            departmentSource,
            departmentMatch,
            exists: ctx.existingNames.has(key),
            existingCategoryId: found?.id ?? null,
            subcategories,
            priority: modeOf(group.priorities),
            labels: labels.slice(0, MAX_LABELS),
            warnings,
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
        const nameColumn = requestedColumn && available.includes(requestedColumn) ? requestedColumn : pickNameColumn(records, available)

        const [assignable, { data: departments }, existing, tagRows] = await Promise.all([
            userService.listAssignable(actor),
            departmentService.list(),
            categoryService.list(),
            db.select({ id: tags.id, name: tags.name }).from(tags).orderBy(asc(tags.name)),
        ])
        const people: HistoryPerson[] = assignable.map((u) => ({
            id: u.id,
            name: `${u.firstName} ${u.lastName ?? ""}`.trim(),
            email: u.email,
            departmentId: u.departmentId ?? null,
            role: u.role,
        }))
        const heads = new Map<string, HistoryPerson>()
        for (const person of people) if (person.departmentId && isDepartmentHeadRole(person.role as Parameters<typeof isDepartmentHeadRole>[0]) && !heads.has(person.departmentId)) heads.set(person.departmentId, person)
        const departmentList: HistoryDepartment[] = departments.map((d) => ({ id: d.id, name: d.name }))
        const existingNames = new Set(existing.map((c) => keyOf(c.name)))
        const existingMap = new Map(existing.map((c) => [keyOf(c.name), { id: c.id, subcategoryKeys: new Set(c.subcategories.map((sub) => keyOf(sub.name))) }]))
        const proposals = buildCategoryProposals(records, nameColumn, { people, departments: departmentList, existingNames, existing: existingMap, tags: tagRows, heads })
        const knownColumns = [...SUBCATEGORY_COLUMNS, ...LABEL_COLUMNS, ...PRIORITY_COLUMNS, ...HOURS_COLUMNS]
        const isList = !headers.some((h) => SLA_COLUMNS.includes(h.trim().toLowerCase())) && headers.some((h) => knownColumns.includes(h.trim().toLowerCase()))

        return {
            columns: available,
            nameColumn,
            totalRows: records.length,
            isList,
            proposals,
            tags: tagRows,
            departments: departmentList,
            people: people.map((p) => ({ id: p.id, name: p.name, email: p.email })),
            heads: [...heads].map(([departmentId, person]) => ({ departmentId, personId: person.id, name: person.name })),
        }
    },
}
