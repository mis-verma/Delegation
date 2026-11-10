import { describe, expect, it } from "vitest"
import { buildBuckets, defaultPeriodRange, mondayOf, percentOf } from "./reportPeriods.js"
import { runItemCounts, sumCells } from "./checklistReport.service.js"

describe("report periods", () => {
    it("starts weeks on Monday", () => {
        expect(mondayOf("2026-11-09")).toBe("2026-11-09")
        expect(mondayOf("2026-11-15")).toBe("2026-11-09")
        expect(mondayOf("2026-11-08")).toBe("2026-11-02")
    })

    it("builds Monday to Sunday weeks clamped to the range", () => {
        const weeks = buildBuckets("week", "2026-10-29", "2026-11-11")
        expect(weeks.map((w) => [w.key, w.from, w.to, w.label])).toEqual([
            ["2026-10-26", "2026-10-29", "2026-11-01", "26 Oct to 1 Nov"],
            ["2026-11-02", "2026-11-02", "2026-11-08", "2 to 8 Nov"],
            ["2026-11-09", "2026-11-09", "2026-11-11", "9 to 15 Nov"],
        ])
    })

    it("builds calendar months with short labels", () => {
        const months = buildBuckets("month", "2026-01-15", "2026-03-02")
        expect(months.map((m) => [m.key, m.from, m.to, m.label])).toEqual([
            ["2026-01-01", "2026-01-15", "2026-01-31", "Jan 2026"],
            ["2026-02-01", "2026-02-01", "2026-02-28", "Feb 2026"],
            ["2026-03-01", "2026-03-01", "2026-03-02", "Mar 2026"],
        ])
    })

    it("defaults to the last four full weeks plus this week, or three months plus this month", () => {
        expect(buildBuckets("week", ...Object.values(defaultPeriodRange("week", "2026-11-11")) as [string, string])).toHaveLength(5)
        expect(defaultPeriodRange("month", "2026-02-10")).toEqual({ from: "2025-11-01", to: "2026-02-10" })
    })

    it("returns nothing for a reversed range", () => {
        expect(buildBuckets("week", "2026-11-10", "2026-11-01")).toEqual([])
    })

    it("rounds percentages to one decimal and gives null when nothing is due", () => {
        expect(percentOf(49, 56)).toBe(87.5)
        expect(percentOf(0, 0)).toBeNull()
    })

    it("counts each run's questions once even when a run appears twice", () => {
        const runs = [
            { id: "a", itemsTotal: 8, itemsDone: 7 },
            { id: "a", itemsTotal: 8, itemsDone: 7 },
            { id: "b", itemsTotal: 8, itemsDone: 8 },
        ]
        expect(runItemCounts(runs)).toEqual({ itemsDue: 16, itemsDone: 15 })
    })

    it("adds up cells and pools compliance instead of averaging percentages", () => {
        const cell = (itemsDue: number, itemsDone: number, weightedGood: number, weightedScored: number) => ({
            itemsDue, itemsDone, completionPct: null, compliancePct: null, answersChecked: weightedScored,
            runsDue: 7, runsDone: 6, runsMissed: 1, runsOpen: 0, weightedGood, weightedScored,
        })
        const total = sumCells([cell(56, 49, 9, 10), cell(56, 56, 1, 10)])
        expect(total.itemsDue).toBe(112)
        expect(total.itemsDone).toBe(105)
        expect(total.completionPct).toBe(93.8)
        expect(total.compliancePct).toBe(50)
        expect(total.runsDue).toBe(14)
    })
})
