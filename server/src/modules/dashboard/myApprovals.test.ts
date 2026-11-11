import { describe, expect, it } from "vitest"
import { toCounts, emptyCounts } from "./myApprovals.js"

describe("toCounts", () => {
    it("splits waiting items into delayed and new", () => {
        expect(toCounts({ waiting: "5", delayed: "2", approvedToday: "3" })).toEqual({ waiting: 5, delayed: 2, fresh: 3, approvedToday: 3 })
    })
    it("never reports more delayed than waiting", () => {
        expect(toCounts({ waiting: 1, delayed: 4, approvedToday: 0 })).toEqual({ waiting: 1, delayed: 1, fresh: 0, approvedToday: 0 })
    })
    it("treats a missing row as zero", () => {
        expect(toCounts(undefined)).toEqual(emptyCounts())
    })
})
