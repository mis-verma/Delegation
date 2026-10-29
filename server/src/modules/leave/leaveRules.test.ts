import { describe, expect, it } from "vitest"
import { canManageLeave, eachDay, rangeProblem, rangesOverlap } from "./leaveRules.js"

describe("eachDay", () => {
    it("lists every day, ends included", () => {
        expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"])
        expect(eachDay("2026-10-30", "2026-10-30")).toEqual(["2026-10-30"])
    })
})

describe("rangesOverlap", () => {
    it("is true when the days touch and false otherwise", () => {
        expect(rangesOverlap({ startDate: "2026-10-01", endDate: "2026-10-05" }, { startDate: "2026-10-05", endDate: "2026-10-08" })).toBe(true)
        expect(rangesOverlap({ startDate: "2026-10-01", endDate: "2026-10-05" }, { startDate: "2026-10-06", endDate: "2026-10-08" })).toBe(false)
    })
})

describe("rangeProblem", () => {
    const today = "2026-10-29"
    it("accepts today and the future", () => {
        expect(rangeProblem("2026-10-29", "2026-10-31", today)).toBeNull()
    })
    it("rejects a backwards range", () => {
        expect(rangeProblem("2026-11-02", "2026-11-01", today)).toMatch(/can't be before/)
    })
    it("rejects too long and too old", () => {
        expect(rangeProblem("2026-10-29", "2027-03-01", today)).toMatch(/at most/)
        expect(rangeProblem("2026-10-01", "2026-10-02", today)).toMatch(/last 14 days/)
    })
})

describe("canManageLeave", () => {
    const person = { id: "p1", role: "USER", departmentId: "d1", isActive: true }
    it("lets Admin and PC manage anyone active", () => {
        expect(canManageLeave({ sub: "a", role: "ADMIN", departmentId: null }, person)).toBe(true)
        expect(canManageLeave({ sub: "a", role: "PC", departmentId: null }, person)).toBe(true)
        expect(canManageLeave({ sub: "a", role: "ADMIN", departmentId: null }, { ...person, isActive: false })).toBe(false)
    })
    it("lets a head manage only their own department, not themselves", () => {
        expect(canManageLeave({ sub: "h", role: "MANAGER", departmentId: "d1" }, person)).toBe(true)
        expect(canManageLeave({ sub: "h", role: "SENIOR", departmentId: "d2" }, person)).toBe(false)
        expect(canManageLeave({ sub: "p1", role: "MANAGER", departmentId: "d1" }, person)).toBe(false)
        expect(canManageLeave({ sub: "h", role: "MANAGER", departmentId: "d1" }, { ...person, role: "PC" })).toBe(false)
    })
    it("keeps everyone else out", () => {
        expect(canManageLeave({ sub: "u", role: "USER", departmentId: "d1" }, person)).toBe(false)
        expect(canManageLeave({ sub: "a", role: "ADMIN", departmentId: null }, { ...person, role: "OWNER" })).toBe(false)
    })
})
