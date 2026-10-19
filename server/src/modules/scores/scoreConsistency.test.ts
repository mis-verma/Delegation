import { describe, expect, it } from "vitest"
import { evaluateConsistency, nightlyWindows, type ConsistencyInput, type CountBlocks } from "./scoreConsistency.js"

const blocks = (checklist: number, ticket: number, delegation: number): CountBlocks => ({
    checklist: { due: checklist, done: checklist, onTime: checklist },
    ticket: { due: ticket, done: ticket, onTime: ticket },
    delegation: { due: delegation, done: delegation, onTime: delegation },
})

const base = (): ConsistencyInput => ({
    from: "2026-10-01",
    to: "2026-10-13",
    explorerTotal: blocks(10, 6, 4),
    scoresOrg: blocks(10, 6, 4),
    reportTotal: blocks(10, 6, 4),
    departments: [blocks(5, 3, 2), blocks(5, 3, 2)],
    stores: [blocks(6, 4, 3), blocks(4, 2, 1)],
    people: [blocks(5, 2, 2), blocks(5, 3, 2), blocks(0, 1, 0)],
    samples: [{ id: "p1", name: "Asha", card: blocks(5, 2, 2), row: blocks(5, 2, 2) }],
    sharing: { runsAcrossDepartments: 0, runsWithSeveralAssignees: 0, runsWithoutAssignee: 0 },
})

describe("evaluateConsistency", () => {
    it("passes a consistent organisation", () => {
        const r = evaluateConsistency(base())
        expect(r.ok).toBe(true)
        expect(r.failed).toBe(0)
        expect(r.flagged).toBe(0)
        expect(r.checks.every((c) => c.status === "pass" && c.diff === 0)).toBe(true)
    })

    it("fails when a ticket is missing from the stores", () => {
        const input = base()
        input.stores = [blocks(6, 3, 3), blocks(4, 2, 1)]
        const r = evaluateConsistency(input)
        expect(r.ok).toBe(false)
        const bad = r.checks.filter((c) => c.status === "fail")
        expect(bad.map((c) => c.id)).toContain("ticket.stores.due")
        const due = bad.find((c) => c.id === "ticket.stores.due")!
        expect(due).toMatchObject({ expected: 6, actual: 5, diff: -1 })
        expect(due.explanation).toContain("1 missing")
    })

    it("fails when delegations of the departments do not add up, or the explorer total differs from the card or the report", () => {
        const input = base()
        input.departments = [blocks(5, 3, 2), blocks(5, 3, 1)]
        input.scoresOrg = blocks(10, 7, 4)
        input.reportTotal = blocks(9, 6, 4)
        const ids = evaluateConsistency(input).checks.filter((c) => c.status === "fail").map((c) => c.id)
        expect(ids).toContain("delegation.departments.due")
        expect(ids).toContain("total.scores.ticket.due")
        expect(ids).toContain("total.report.checklist.due")
    })

    it("fails when a person card and the explorer row differ", () => {
        const input = base()
        input.samples = [{ id: "p1", name: "Asha", card: blocks(5, 2, 2), row: blocks(4, 2, 2) }]
        const r = evaluateConsistency(input)
        expect(r.checks.find((c) => c.id === "person.p1.due")).toMatchObject({ status: "fail", expected: 9, actual: 8 })
    })

    it("flags, never fails, a checklist gap caused by shared runs, and names the cause and the gap", () => {
        const input = base()
        input.departments = [blocks(6, 3, 2), blocks(6, 3, 2)]
        input.people = [blocks(6, 2, 2), blocks(6, 3, 2), blocks(0, 1, 0)]
        input.sharing = { runsAcrossDepartments: 2, runsWithSeveralAssignees: 2, runsWithoutAssignee: 0 }
        const r = evaluateConsistency(input)
        expect(r.ok).toBe(true)
        expect(r.failed).toBe(0)
        const flag = r.checks.find((c) => c.id === "checklist.departments.due.flag")!
        expect(flag).toMatchObject({ status: "flag", expected: 10, actual: 12, diff: 2 })
        expect(flag.explanation).toContain("2 runs are shared across departments")
        expect(flag.explanation).toContain("+2")
        const peopleFlag = r.checks.find((c) => c.id === "checklist.people.due.flag")!
        expect(peopleFlag.status).toBe("flag")
        expect(peopleFlag.explanation).toContain("2 runs have several assignees")
    })

    it("flags runs with nobody assigned as a gap, not a failure", () => {
        const input = base()
        input.departments = [blocks(4, 3, 2), blocks(5, 3, 2)]
        input.sharing = { runsAcrossDepartments: 0, runsWithSeveralAssignees: 0, runsWithoutAssignee: 1 }
        const r = evaluateConsistency(input)
        expect(r.ok).toBe(true)
        expect(r.checks.find((c) => c.id === "checklist.departments.due.flag")).toMatchObject({ status: "flag", diff: -1 })
    })
})

describe("nightlyWindows", () => {
    it("gives last month and month to date", () => {
        expect(nightlyWindows("2026-10-13")).toEqual([
            { label: "last month", from: "2026-09-01", to: "2026-09-30" },
            { label: "month to date", from: "2026-10-01", to: "2026-10-13" },
        ])
    })
    it("rolls over a year boundary and a short month", () => {
        expect(nightlyWindows("2027-01-02")[0]).toEqual({ label: "last month", from: "2026-12-01", to: "2026-12-31" })
        expect(nightlyWindows("2026-03-05")[0]).toEqual({ label: "last month", from: "2026-02-01", to: "2026-02-28" })
    })
})
