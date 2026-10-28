import { describe, expect, it } from "vitest"
import { buildCategoryTat, summarize, type TatCategory, type TatTicket, type TatUpdate } from "./categoryTat.js"

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, 0) + minutes * 60_000)

const category = (over: Partial<TatCategory> = {}): TatCategory => ({
    id: "c1",
    name: "Network",
    isActive: true,
    departmentName: "IT",
    tatHours: 24,
    ...over,
})

const ticket = (over: Partial<TatTicket> = {}): TatTicket => ({
    id: "t1",
    categoryId: "c1",
    createdAt: at(0),
    closedAt: at(300),
    declinedAt: null,
    status: "CLOSED",
    tatDueAt: at(240),
    ...over,
})

describe("summarize", () => {
    it("is empty for no values", () => {
        expect(summarize([])).toEqual({ count: 0, avg: null, median: null, p80: null, p90: null })
    })

    it("computes average, median and percentiles", () => {
        const summary = summarize([10, 20, 30, 40, 100])
        expect(summary.avg).toBe(40)
        expect(summary.median).toBe(30)
        expect(summary.p90).toBe(76)
    })
})

describe("buildCategoryTat", () => {
    it("measures response, completion, closure and SLA for a closed ticket", () => {
        const updates: TatUpdate[] = [
            { ticketId: "t1", toStatus: "IN_PROGRESS", createdAt: at(30) },
            { ticketId: "t1", toStatus: "PENDING_APPROVAL", createdAt: at(200) },
        ]
        const { rows, total } = buildCategoryTat([category()], [ticket()], updates)
        const row = rows[0]!
        expect(row.closed).toBe(1)
        expect(row.response.median).toBe(30)
        expect(row.completion.median).toBe(200)
        expect(row.closure.median).toBe(300)
        expect(row.slaMet).toBe(1)
        expect(row.slaMetPct).toBe(100)
        expect(total.total).toBe(1)
    })

    it("counts a late completion as a breach", () => {
        const updates: TatUpdate[] = [{ ticketId: "t1", toStatus: "PENDING_APPROVAL", createdAt: at(280) }]
        const row = buildCategoryTat([category()], [ticket()], updates).rows[0]!
        expect(row.slaBreached).toBe(1)
        expect(row.slaMetPct).toBe(0)
    })

    it("sums on-hold time until the next move", () => {
        const updates: TatUpdate[] = [
            { ticketId: "t1", toStatus: "ON_HOLD", createdAt: at(50) },
            { ticketId: "t1", toStatus: "IN_PROGRESS", createdAt: at(110) },
            { ticketId: "t1", toStatus: "PENDING_APPROVAL", createdAt: at(200) },
        ]
        expect(buildCategoryTat([category()], [ticket()], updates).rows[0]!.onHoldAvg).toBe(60)
    })

    it("keeps rejected and open tickets out of the timing numbers", () => {
        const tickets = [
            ticket({ id: "r", declinedAt: at(10), status: "OPEN", closedAt: null }),
            ticket({ id: "o", status: "IN_PROGRESS", closedAt: null }),
        ]
        const updates: TatUpdate[] = [{ ticketId: "o", toStatus: "IN_PROGRESS", createdAt: at(20) }]
        const row = buildCategoryTat([category()], tickets, updates).rows[0]!
        expect(row.rejected).toBe(1)
        expect(row.open).toBe(1)
        expect(row.completion.count).toBe(0)
        expect(row.response.count).toBe(1)
    })

    it("groups tickets without a category and suggests a TAT only with enough samples", () => {
        const many = Array.from({ length: 5 }, (_, i) => ticket({ id: `t${i}`, closedAt: at(120 + i * 60) }))
        const { rows } = buildCategoryTat([category()], [...many, ticket({ id: "x", categoryId: null })], [])
        expect(rows.find((row) => row.name === "Uncategorised")?.total).toBe(1)
        const named = rows.find((row) => row.name === "Network")!
        expect(named.suggestedTatHours).toBe(6)
        expect(rows.find((row) => row.name === "Uncategorised")?.suggestedTatHours).toBeNull()
    })

    it("lists active categories with no tickets", () => {
        const { rows } = buildCategoryTat([category(), category({ id: "c2", name: "Printer" }), category({ id: "c3", name: "Old", isActive: false })], [], [])
        expect(rows.map((row) => row.name).sort()).toEqual(["Network", "Printer"])
    })
})
