import { describe, expect, it } from "vitest"
import type { DefinitionRow } from "../checklistReports/checklistReport.service.js"
import { EMPTY_METRICS, foldChecklist, foldTasks, foldTickets, rankFields, type ModuleBlocks, type ScoreWindow, type TaskLike, type TicketLike } from "./scoreBlocks.js"
import { capWindow, explorerNotes, shapeExplorer, type ScoredRow } from "./scoreExplorer.js"

const d = (iso: string) => new Date(`${iso}Z`)
const win: ScoreWindow = { start: d("2026-10-01T00:00:00"), end: d("2026-10-11T00:00:00") }
const now = d("2026-10-10T18:00:00")

const closedTicket = (day: string): TicketLike => ({ status: "CLOSED", tatDueAt: d(`2026-10-${day}T10:00:00`), closedAt: d(`2026-10-${day}T09:00:00`), submittedAt: null })
const doneTask = (day: string): TaskLike => ({ status: "done", dueDate: d(`2026-10-${day}T10:00:00`), finishedAt: d(`2026-10-${day}T09:00:00`) })

const scored = (id: string, name: string, o: { runs?: number; tickets?: number; tasks?: number } = {}): ScoredRow => {
    const runs = o.runs ?? 0
    const blocks: ModuleBlocks = {
        checklist: foldChecklist({ ...EMPTY_METRICS, due: runs, completed: runs, onTime: runs, weightedGood: runs, weightedScored: runs, completionPct: runs ? 100 : null, compliancePct: runs ? 100 : null }),
        ticket: foldTickets(Array.from({ length: o.tickets ?? 0 }, () => closedTicket("03")), now, win),
        delegation: foldTasks(Array.from({ length: o.tasks ?? 0 }, () => doneTask("04")), now, win),
    }
    return { id, name, ...blocks, ...rankFields(blocks) } as ScoredRow
}

describe("shapeExplorer", () => {
    const total = scored("total", "Whole organisation", { runs: 6, tickets: 4, tasks: 2 })

    it("shapes departments with shared runs and keeps rows, total and unassigned apart", () => {
        const out = shapeExplorer({
            view: "department",
            parentId: "store-1",
            total,
            unassigned: scored("unassigned", "Unassigned", { tickets: 1 }),
            departments: [scored("d1", "Sales", { runs: 4, tickets: 2 }), scored("d2", "Ops", { runs: 3, tickets: 2, tasks: 2 })],
            sharedRunsByDepartment: new Map([["d1", 1], ["d2", 1]]),
        })
        expect(out.rows.map((r) => r.id)).toEqual(["d1", "d2"])
        expect(out.rows.every((r) => r.kind === "department" && r.parentId === "store-1")).toBe(true)
        expect(out.rows[0]!.shared.runsSharedWithOthers).toBe(1)
        expect(out.rows[0]!.checklist).toMatchObject({ due: 4, done: 4, completion: 100, compliance: 100, wGood: 4, wScored: 4 })
        expect(out.rows[0]!.ticket.waitingOnTime).toBe(0)
        expect(out.total).toMatchObject({ kind: "total", totalDue: 12 })
        expect(out.total.parentId).toBeUndefined()
        expect(out.unassigned).toMatchObject({ kind: "unassigned", totalDue: 1 })
    })

    it("drops the Unassigned row from people rows and hides an empty unassigned row", () => {
        const out = shapeExplorer({
            view: "person",
            total,
            unassigned: scored("unassigned", "Unassigned"),
            people: [scored("p1", "Asha", { runs: 5 }), scored("unassigned", "Unassigned", { tickets: 1 })],
            sharedRunsByPerson: new Map([["p1", 2]]),
        })
        expect(out.rows.map((r) => r.id)).toEqual(["p1"])
        expect(out.rows[0]!.shared.runsSharedWithOthers).toBe(2)
        expect(out.unassigned).toBeNull()
    })

    it("marks inactive stores", () => {
        const out = shapeExplorer({ view: "store", total, unassigned: null, stores: [{ ...scored("s1", "Mall (inactive)", { runs: 2 }), inactive: true }, scored("no-store", "Other / no store", { tickets: 1 })] })
        expect(out.rows[0]).toMatchObject({ kind: "store", inactive: true })
        expect(out.rows[1]!.inactive).toBeUndefined()
    })

    it("marks people who have left", () => {
        const out = shapeExplorer({ view: "person", total, unassigned: null, people: [{ ...scored("p2", "Ravi (left)", { runs: 3 }), left: true }] })
        expect(out.rows[0]).toMatchObject({ kind: "person", left: true })
    })

    it("stamps the current department on person rows, and No department when there is none", () => {
        const out = shapeExplorer({
            view: "person",
            total,
            unassigned: null,
            people: [
                { ...scored("p1", "Asha", { runs: 5 }), department: "Sales", departmentId: "d1" },
                { ...scored("p2", "Ravi", { runs: 2 }), department: "No department", departmentId: null },
                scored("p3", "Meera", { runs: 1 }),
            ],
        })
        expect(out.rows[0]).toMatchObject({ departmentId: "d1", departmentName: "Sales" })
        expect(out.rows[1]).toMatchObject({ departmentId: null, departmentName: "No department" })
        expect(out.rows[2]).toMatchObject({ departmentId: null, departmentName: "No department" })
    })

    it("leaves department fields off non-person rows", () => {
        const out = shapeExplorer({ view: "department", total, unassigned: null, departments: [{ ...scored("d1", "Sales", { runs: 4 }), department: "Sales" }] })
        expect(out.rows[0]!.departmentName).toBeUndefined()
    })

    it("builds checklist rows from definitions, with only the checklist block filled", () => {
        const def: DefinitionRow = { ...EMPTY_METRICS, due: 10, completed: 8, onTime: 7, completionPct: 80, weightedGood: 6, weightedScored: 8, compliancePct: 75, definitionId: "def-1", title: "Opening", recurrence: "DAILY" }
        const out = shapeExplorer({ view: "checklist", parentId: "p1", total, unassigned: null, definitions: [def] })
        expect(out.rows).toHaveLength(1)
        expect(out.rows[0]).toMatchObject({ id: "def-1", name: "Opening", kind: "checklist", recurrence: "DAILY", parentId: "p1" })
        expect(out.rows[0]!.checklist).toMatchObject({ due: 10, done: 8, late: 1, notDone: 2, completion: 80, compliance: 75 })
        expect(out.rows[0]!.ticket.due).toBe(0)
        expect(out.rows[0]!.totalDue).toBe(10)
    })

    it("cuts the total into three module rows that add up to it", () => {
        const out = shapeExplorer({ view: "module", total, unassigned: null })
        expect(out.rows.map((r) => r.id)).toEqual(["checklist", "ticket", "delegation"])
        expect(out.rows.map((r) => r.totalDue)).toEqual([6, 4, 2])
        expect(out.rows.reduce((n, r) => n + r.totalDue, 0)).toBe(out.total.totalDue)
        expect(out.rows[1]!.checklist.due).toBe(0)
    })

    it("applies the module filter: other modules emptied, overall follows one module, empty rows dropped", () => {
        const out = shapeExplorer({
            view: "department",
            module: "ticket",
            total,
            unassigned: null,
            departments: [scored("d1", "Sales", { runs: 4, tickets: 2 }), scored("d2", "Ops", { runs: 3 })],
        })
        expect(out.rows.map((r) => r.id)).toEqual(["d1"])
        expect(out.rows[0]!.checklist.due).toBe(0)
        expect(out.rows[0]!.totalDue).toBe(2)
        expect(out.total.totalDue).toBe(4)
        expect(out.rows[0]!.overall).toBe(100)
    })
})

describe("capWindow", () => {
    it("caps the end at today and reports it", () => {
        expect(capWindow("2026-10-01", "2026-10-31", "2026-10-13")).toEqual({ from: "2026-10-01", to: "2026-10-13", capped: true })
        expect(capWindow("2026-10-01", "2026-10-05", "2026-10-13")).toEqual({ from: "2026-10-01", to: "2026-10-05", capped: false })
    })
    it("pulls a start that is after today back to today", () => {
        expect(capWindow("2026-11-01", "2026-11-30", "2026-10-13")).toEqual({ from: "2026-10-13", to: "2026-10-13", capped: true })
    })
})

describe("explorerNotes", () => {
    it("says which checklist kinds are counted and what the filters do", () => {
        const all = explorerNotes({ view: "department", departmentLocked: false, storesHidden: false })
        expect(all.some((n) => n.includes("every kind"))).toBe(true)
        const daily = explorerNotes({ view: "store", recurrence: "DAILY", module: "checklist", storeId: "s1", departmentLocked: true, storesHidden: true })
        expect(daily.some((n) => n.includes("daily"))).toBe(true)
        expect(daily.some((n) => n.includes("Admin and PC only"))).toBe(true)
    })
})
