import { describe, expect, it } from "vitest"
import { EMPTY_METRICS, emptyBlocks, foldChecklist, type ModuleBlocks } from "./scoreBlocks.js"
import { toExplorerRow, type ExplorerRow } from "./scoreExplorer.js"
import { MATRIX_MAX_COLUMNS, cellOf, matrixBuckets, shapeMatrix } from "./scoreMatrix.js"

const withRuns = (runs: number, done: number): ModuleBlocks => ({
    ...emptyBlocks(),
    checklist: foldChecklist({ ...EMPTY_METRICS, due: runs, completed: done, onTime: done, weightedGood: done, weightedScored: runs, completionPct: runs ? (done / runs) * 100 : null, compliancePct: runs ? (done / runs) * 100 : null }),
})

const row = (id: string, name: string, runs = 0, done = 0): ExplorerRow => toExplorerRow({ id, name, kind: "department" }, runs ? withRuns(runs, done) : emptyBlocks())

describe("matrixBuckets", () => {
    it("returns one bucket per day", () => {
        const out = matrixBuckets("day", "2026-10-01", "2026-10-03")
        expect(out).toEqual([
            { from: "2026-10-01", to: "2026-10-01" },
            { from: "2026-10-02", to: "2026-10-02" },
            { from: "2026-10-03", to: "2026-10-03" },
        ])
    })

    it("cuts weeks on Monday and clips the first and last week to the window", () => {
        const out = matrixBuckets("week", "2026-10-07", "2026-10-20")
        expect(out).toEqual([
            { from: "2026-10-07", to: "2026-10-11" },
            { from: "2026-10-12", to: "2026-10-18" },
            { from: "2026-10-19", to: "2026-10-20" },
        ])
    })

    it("cuts calendar months and clips to the window", () => {
        const out = matrixBuckets("month", "2026-09-15", "2026-11-10")
        expect(out).toEqual([
            { from: "2026-09-15", to: "2026-09-30" },
            { from: "2026-10-01", to: "2026-10-31" },
            { from: "2026-11-01", to: "2026-11-10" },
        ])
    })

    it("handles a window that crosses a year end", () => {
        const out = matrixBuckets("month", "2026-12-20", "2027-01-05")
        expect(out.map((b) => b.from)).toEqual(["2026-12-20", "2027-01-01"])
    })

    it("returns nothing for an inverted window and every bucket tiles the window exactly", () => {
        expect(matrixBuckets("day", "2026-10-05", "2026-10-01")).toEqual([])
        const weeks = matrixBuckets("week", "2026-03-02", "2026-06-30")
        expect(weeks[0]?.from).toBe("2026-03-02")
        expect(weeks[weeks.length - 1]?.to).toBe("2026-06-30")
        weeks.slice(1).forEach((b, i) => {
            const prevEnd = Date.parse(`${weeks[i]!.to}T00:00:00Z`)
            expect(Date.parse(`${b.from}T00:00:00Z`) - prevEnd).toBe(86_400_000)
        })
    })

    it("keeps a full year of months under the column cap and a year of days over it", () => {
        expect(matrixBuckets("month", "2026-01-01", "2026-12-31")).toHaveLength(12)
        expect(matrixBuckets("day", "2026-01-01", "2026-12-31").length).toBeGreaterThan(MATRIX_MAX_COLUMNS)
    })
})

describe("shapeMatrix", () => {
    const base = { total: row("total", "Whole organisation", 10, 8), rows: [row("a", "Alpha", 6, 6), row("b", "Beta", 4, 2), row("c", "Idle")] }

    it("maps each row onto the buckets, leaves null where a row had nothing due, and drops rows with no work", () => {
        const perBucket = [
            { total: row("total", "t", 5, 4), rows: [row("a", "Alpha", 3, 3), row("b", "Beta", 2, 1)] },
            { total: row("total", "t", 5, 4), rows: [row("a", "Alpha", 3, 3), row("b", "Beta")] },
        ]
        const out = shapeMatrix(base, perBucket)
        expect(out.rows.map((r) => r.id)).toEqual(["a", "b"])
        expect(out.rows[0]?.cells).toHaveLength(2)
        expect(out.rows[0]?.cells[0]?.checklist.due).toBe(3)
        expect(out.rows[1]?.cells[0]?.checklist.due).toBe(2)
        expect(out.rows[1]?.cells[1]).toBeNull()
        expect(out.total.cells).toHaveLength(2)
        expect(out.total.whole.totalDue).toBe(10)
        expect(out.truncated).toBe(false)
    })

    it("orders rows by work volume and flags truncation past the row cap", () => {
        const many = { total: base.total, rows: Array.from({ length: 5 }, (_, i) => row(`r${i}`, `Row ${i}`, i + 1, i + 1)) }
        const out = shapeMatrix(many, [], 3)
        expect(out.rows.map((r) => r.id)).toEqual(["r4", "r3", "r2"])
        expect(out.truncated).toBe(true)
    })

    it("treats a row missing from a bucket as null", () => {
        const out = shapeMatrix(base, [{ total: row("total", "t", 1, 1), rows: [] }])
        expect(out.rows[0]?.cells).toEqual([null])
    })

    it("cellOf keeps only the fields the client draws", () => {
        const cell = cellOf(row("a", "Alpha", 4, 3))
        expect(Object.keys(cell).sort()).toEqual(["checklist", "delegation", "overall", "ticket", "totalDue"])
        expect(Object.keys(cell.checklist).sort()).toEqual(["completion", "compliance", "done", "due", "late", "onTime", "score"])
    })
})
