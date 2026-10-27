import { describe, expect, it } from "vitest"
import { bucketOf, createAggregator, resolveGranularity, type DepartmentRef, type ReportItem } from "./departmentReport.js"

const IST = 330

const departments: DepartmentRef[] = [
    { id: "d1", name: "Sales", isActive: true },
    { id: "d2", name: "Accounts", isActive: true },
    { id: "d3", name: "Old team", isActive: false },
]

const item = (over: Partial<ReportItem>): ReportItem => ({
    departmentId: "d1",
    status: "open",
    createdAt: new Date("2026-10-06T08:00:00Z"),
    dueAt: null,
    handedInAt: null,
    completedAt: null,
    overdue: false,
    ...over,
})

describe("resolveGranularity", () => {
    it("keeps an explicit choice", () => {
        expect(resolveGranularity("week", 900)).toBe("week")
    })

    it("picks week, month, year by span", () => {
        expect(resolveGranularity("auto", 7)).toBe("week")
        expect(resolveGranularity("auto", 365)).toBe("month")
        expect(resolveGranularity("auto", 1200)).toBe("year")
    })
})

describe("bucketOf", () => {
    it("groups a week from its Monday", () => {
        expect(bucketOf(new Date("2026-10-11T08:00:00Z"), "week", IST)).toEqual({ sortKey: "2026-10-05", label: "Week of 05 Oct 2026" })
    })

    it("uses the org clock near midnight", () => {
        expect(bucketOf(new Date("2026-10-31T19:00:00Z"), "month", IST).label).toBe("Nov 2026")
    })

    it("buckets a year", () => {
        expect(bucketOf(new Date("2026-03-01T00:00:00Z"), "year", IST).label).toBe("2026")
    })
})

describe("createAggregator", () => {
    it("counts per department with a total row and every active department", () => {
        const agg = createAggregator("month", IST)
        agg.add(item({ status: "done", completedAt: new Date("2026-10-08T08:00:00Z"), dueAt: new Date("2026-10-10T00:00:00Z") }))
        agg.add(item({ status: "in_progress", overdue: true }))
        agg.add(item({ departmentId: null }))

        const { summary } = agg.finish(departments)
        expect(summary.map((r) => r.department)).toEqual(["Accounts", "Sales", "No department", "All departments"])
        const sales = summary.find((r) => r.department === "Sales")!
        expect(sales).toMatchObject({ raised: 2, done: 1, in_progress: 1, overdue: 1, completedPct: 50, onTimePct: 100, avgDays: 2 })
        expect(summary.find((r) => r.department === "Accounts")).toMatchObject({ raised: 0, completedPct: "", onTimePct: "" })
        expect(summary.at(-1)).toMatchObject({ raised: 3 })
    })

    it("does not count a finished item as overdue and flags late hand-ins", () => {
        const agg = createAggregator("month", IST)
        agg.add(item({ status: "done", overdue: true, completedAt: new Date("2026-10-12T00:00:00Z"), dueAt: new Date("2026-10-10T00:00:00Z") }))
        const sales = agg.finish(departments).summary.find((r) => r.department === "Sales")!
        expect(sales).toMatchObject({ overdue: 0, onTimePct: 0 })
    })

    it("hides inactive departments with no rows and keeps ones that have rows", () => {
        const agg = createAggregator("month", IST)
        agg.add(item({ departmentId: "d3" }))
        const names = agg.finish(departments).summary.map((r) => r.department)
        expect(names).toContain("Old team")
    })

    it("limits to one department and orders periods", () => {
        const agg = createAggregator("week", IST)
        agg.add(item({ createdAt: new Date("2026-10-13T08:00:00Z") }))
        agg.add(item({ createdAt: new Date("2026-10-06T08:00:00Z"), status: "done", completedAt: new Date("2026-10-07T08:00:00Z") }))
        agg.add(item({ departmentId: "d2" }))

        const report = agg.finish(departments, "d1")
        expect(report.summary.map((r) => r.department)).toEqual(["Sales", "All departments"])
        expect(report.periods.map((r) => r.period)).toEqual(["Week of 05 Oct 2026", "Week of 12 Oct 2026"])
        expect(report.periods[0]).toMatchObject({ raised: 1, completed: 1, stillOpen: 0 })
    })
})
