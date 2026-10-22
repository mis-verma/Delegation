import type { DefinitionRow } from "../checklistReports/checklistReport.service.js"
import {
    emptyBlocks,
    foldChecklist,
    rankFields,
    type ChecklistScore,
    type DelegationScore,
    type ModuleBlocks,
    type TicketScore,
} from "./scoreBlocks.js"
import { SCORE_REPORT_NOTES } from "./scoreNotes.js"
import { rawPct } from "./scoreFormulas.js"

export const EXPLORER_VIEWS = ["department", "store", "person", "checklist", "module"] as const
export type ExplorerView = (typeof EXPLORER_VIEWS)[number]
export const EXPLORER_MODULES = ["checklist", "ticket", "delegation"] as const
export type ExplorerModule = (typeof EXPLORER_MODULES)[number]
export type ExplorerRowKind = ExplorerView | "total" | "unassigned"

type CommonBlock = {
    due: number
    done: number
    onTime: number
    late: number
    notDone: number
    open: number
    completion: number | null
    compliance: number | null
    onTimeOfFinishedPct: number | null
    metDeadlinePct: number | null
    score: number | null
}
export type ExplorerChecklistBlock = CommonBlock & {
    wGood: number
    wScored: number
    submitted: number
    approved: number
}
export type ExplorerTicketBlock = CommonBlock & { waitingOnTime: number }
export type ExplorerDelegationBlock = CommonBlock & { waitingOnTime: number; overdue: number }

export type ExplorerRow = {
    id: string
    name: string
    kind: ExplorerRowKind
    parentId?: string
    inactive?: boolean
    left?: boolean
    recurrence?: string
    departmentId?: string | null
    departmentName?: string
    checklist: ExplorerChecklistBlock
    ticket: ExplorerTicketBlock
    delegation: ExplorerDelegationBlock
    overall: number | null
    totalDue: number
    rankable: boolean
    shared: { runsSharedWithOthers: number }
}

const checklistBlock = (c: ChecklistScore): ExplorerChecklistBlock => ({
    due: c.due, done: c.done, onTime: c.onTime, late: c.late, notDone: c.notDone, open: c.open,
    completion: c.completionPct, compliance: c.compliancePct, onTimeOfFinishedPct: c.onTimeOfFinishedPct, metDeadlinePct: c.metDeadlinePct, score: c.score,
    wGood: c.weightedGood, wScored: c.weightedScored, submitted: c.submitted, approved: c.approved,
})
const ticketBlock = (t: TicketScore): ExplorerTicketBlock => ({
    due: t.due, done: t.done, onTime: t.onTime, late: t.late, notDone: t.notDone, open: t.open,
    completion: t.completionPct, compliance: t.compliancePct, onTimeOfFinishedPct: t.onTimeOfFinishedPct, metDeadlinePct: t.metDeadlinePct, score: t.score,
    waitingOnTime: t.waitingOnTime,
})
const delegationBlock = (d: DelegationScore): ExplorerDelegationBlock => ({
    due: d.due, done: d.done, onTime: d.onTime, late: d.late, notDone: d.notDone, open: d.open,
    completion: d.completionPct, compliance: d.compliancePct, onTimeOfFinishedPct: d.onTimeOfFinishedPct, metDeadlinePct: d.metDeadlinePct, score: d.score,
    waitingOnTime: d.waitingOnTime, overdue: d.overdue,
})

export const onlyModule = (b: ModuleBlocks, module: ExplorerModule | undefined): ModuleBlocks => {
    if (!module) return b
    const empty = emptyBlocks()
    return { checklist: module === "checklist" ? b.checklist : empty.checklist, ticket: module === "ticket" ? b.ticket : empty.ticket, delegation: module === "delegation" ? b.delegation : empty.delegation }
}

export type ExplorerRowBase = { id: string; name: string; kind: ExplorerRowKind; parentId?: string; inactive?: boolean; left?: boolean; recurrence?: string; departmentId?: string | null; departmentName?: string }

export const toExplorerRow = (base: ExplorerRowBase, blocks: ModuleBlocks, runsSharedWithOthers = 0): ExplorerRow => ({
    id: base.id,
    name: base.name,
    kind: base.kind,
    ...(base.parentId ? { parentId: base.parentId } : {}),
    ...(base.inactive ? { inactive: true } : {}),
    ...(base.left ? { left: true } : {}),
    ...(base.recurrence ? { recurrence: base.recurrence } : {}),
    ...(base.departmentName !== undefined ? { departmentId: base.departmentId ?? null, departmentName: base.departmentName } : {}),
    checklist: checklistBlock(blocks.checklist),
    ticket: ticketBlock(blocks.ticket),
    delegation: delegationBlock(blocks.delegation),
    ...rankFields(blocks),
    shared: { runsSharedWithOthers },
})

export type ScoredRow = ModuleBlocks & { id: string; name: string; left?: boolean; inactive?: boolean; department?: string; departmentId?: string | null }

const NO_DEPARTMENT_NAME = "No department"
const MODULE_LABEL: Record<ExplorerModule, string> = { checklist: "Checklists", ticket: "Tickets", delegation: "Delegations" }

export type ExplorerShapeInput = {
    view: ExplorerView
    module?: ExplorerModule
    parentId?: string
    total: ScoredRow
    unassigned: ScoredRow | null
    departments?: readonly ScoredRow[]
    people?: readonly ScoredRow[]
    stores?: readonly ScoredRow[]
    definitions?: readonly DefinitionRow[]
    sharedRunsByPerson?: ReadonlyMap<string, number>
    sharedRunsByDepartment?: ReadonlyMap<string, number>
}

export type ExplorerShape = { total: ExplorerRow; rows: ExplorerRow[]; unassigned: ExplorerRow | null }

export const shapeExplorer = (input: ExplorerShapeInput): ExplorerShape => {
    const { view, module, parentId } = input
    const make = (r: ScoredRow, kind: ExplorerRowKind, shared = 0, extra: Partial<ExplorerRowBase> = {}) =>
        toExplorerRow({ id: r.id, name: r.name, kind, parentId, left: r.left, inactive: r.inactive, ...extra }, onlyModule(r, module), shared)

    const total = toExplorerRow({ id: input.total.id, name: input.total.name, kind: "total" }, onlyModule(input.total, module))
    let rows: ExplorerRow[] = []
    if (view === "department") rows = (input.departments ?? []).map((r) => make(r, "department", input.sharedRunsByDepartment?.get(r.id) ?? 0))
    else if (view === "person") rows = (input.people ?? []).filter((r) => r.id !== "unassigned").map((r) => make(r, "person", input.sharedRunsByPerson?.get(r.id) ?? 0, { departmentId: r.departmentId ?? null, departmentName: r.departmentId ? r.department || NO_DEPARTMENT_NAME : NO_DEPARTMENT_NAME }))
    else if (view === "store") rows = (input.stores ?? []).map((r) => make(r, "store"))
    else if (view === "checklist") {
        rows = (input.definitions ?? []).map((d) => {
            const blocks: ModuleBlocks = { ...emptyBlocks(), checklist: foldChecklist(d) }
            return toExplorerRow({ id: d.definitionId, name: d.title, kind: "checklist", parentId, recurrence: d.recurrence }, onlyModule(blocks, module), 0)
        })
    } else {
        const mods: ExplorerModule[] = module ? [module] : [...EXPLORER_MODULES]
        rows = mods.map((m) => toExplorerRow({ id: m, name: MODULE_LABEL[m], kind: "module", parentId }, onlyModule(input.total, m), 0))
    }
    if (module && view !== "module") rows = rows.filter((r) => r.totalDue > 0)

    const unassigned = input.unassigned ? make(input.unassigned, "unassigned") : null
    return { total, rows, unassigned: unassigned && unassigned.totalDue > 0 ? unassigned : null }
}

export const sumDue = (rows: readonly ExplorerRow[]) => rows.reduce((n, r) => n + r.totalDue, 0)

export const completionOf = (b: { done: number; due: number }) => rawPct(b.done, b.due)

export const explorerNotes = (opts: { view: ExplorerView; module?: ExplorerModule; recurrence?: string; storeId?: string; departmentLocked: boolean; allDepartments?: boolean; storesHidden: boolean; parentKind?: string | null }): string[] => {
    const notes = [...SCORE_REPORT_NOTES]
    if (opts.view === "person") notes.push("People: each row is that person's whole work, the same figures as their own score card. Work with nobody assigned is on the Unassigned row, kept apart from the people rows.")
    if (opts.view === "department") notes.push("Departments: each row is the work filed under that department. A checklist run shared across departments is counted in each of them (see Runs shared), so departments can add up to more than the total.")
    if (opts.view === "store") notes.push("Stores: each run, ticket and delegation sits on exactly one store row (or Other / no store), so the stores add up to the total.")
    if (opts.view === "checklist") notes.push("Checklists: one row per checklist, each of its runs counted once. Tickets and delegations are not part of this view.")
    if (opts.view === "module") notes.push("Modules: the whole scope cut by what kind of work it is. Each row carries only its own figures.")
    if (opts.recurrence) notes.push(`Checklist runs are limited to ${opts.recurrence.toLowerCase().replace("_", "-")} checklists. Tickets and delegations are not affected by this filter.`)
    else notes.push("Checklist runs of every kind (daily, weekly, monthly, one-time) are included.")
    if (opts.module) notes.push(`Only ${opts.module === "ticket" ? "tickets" : opts.module === "delegation" ? "delegations" : "checklists"} are counted: Overall, due and rank follow that module alone.`)
    if (opts.storeId) notes.push("A store filter narrows every module to that store, people rows included.")
    if (opts.parentKind) notes.push(`Drill-down inside one ${opts.parentKind}.`)
    if (opts.allDepartments) notes.push("Every department is shown so you can compare. Only your own department opens up to its people and checklists.")
    else if (opts.departmentLocked) notes.push("You see your own department: its work, and the people on its record with their whole numbers.")
    if (opts.storesHidden) notes.push("Store figures are shown to Admin and PC only.")
    return notes
}

export const capWindow = (from: string, to: string, today: string) => {
    const cappedTo = to > today ? today : to
    const cappedFrom = from > cappedTo ? cappedTo : from
    return { from: cappedFrom, to: cappedTo, capped: cappedTo !== to }
}
