import { describe, expect, it } from "vitest"
import { canAskForOwnLeave, canDecideLeave, canManageLeave, canRemoveLeave, eachDay, leaveScopeFor, rangeProblem, rangesOverlap, statusForNewLeave } from "./leaveRules.js"

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
        expect(rangeProblem("2026-10-29", "2026-10-31", today, "ADMIN")).toBeNull()
    })
    it("rejects a backwards range", () => {
        expect(rangeProblem("2026-11-02", "2026-11-01", today, "ADMIN")).toMatch(/can't be before/)
    })
    it("rejects too long and too old", () => {
        expect(rangeProblem("2026-10-29", "2027-03-01", today, "ADMIN")).toMatch(/at most/)
        expect(rangeProblem("2026-10-01", "2026-10-02", today, "ADMIN")).toMatch(/last 14 days/)
    })
    it("limits heads to yesterday onward", () => {
        expect(rangeProblem("2026-10-28", "2026-10-29", today, "MANAGER")).toBeNull()
        expect(rangeProblem("2026-10-27", "2026-10-29", today, "SENIOR")).toMatch(/ask an admin/i)
        expect(rangeProblem("2026-10-20", "2026-10-29", today, "PC")).toBeNull()
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

describe("leave requests", () => {
    const me = { id: "u1", role: "USER", departmentId: "d1", isActive: true }
    const staff = { sub: "u1", role: "USER", departmentId: "d1" }
    const head = { sub: "h", role: "MANAGER", departmentId: "d1" }
    const today = "2026-11-13"

    it("gives each role the right list scope", () => {
        expect(leaveScopeFor("ADMIN")).toBe("all")
        expect(leaveScopeFor("OWNER")).toBe("all")
        expect(leaveScopeFor("SENIOR")).toBe("department")
        expect(leaveScopeFor("USER")).toBe("own")
        expect(leaveScopeFor("AGENT")).toBe("own")
    })
    it("lets anyone but the owner ask for their own leave only", () => {
        expect(canAskForOwnLeave(staff, me)).toBe(true)
        expect(canAskForOwnLeave(staff, { ...me, id: "u2" })).toBe(false)
        expect(canAskForOwnLeave({ ...staff, role: "OWNER" }, { ...me, role: "OWNER" })).toBe(false)
    })
    it("makes own leave a request unless Admin or PC", () => {
        expect(statusForNewLeave(staff, me)).toBe("PENDING")
        expect(statusForNewLeave({ sub: "h", role: "MANAGER", departmentId: "d1" }, { ...me, id: "h", role: "MANAGER" })).toBe("PENDING")
        expect(statusForNewLeave({ sub: "a", role: "ADMIN", departmentId: null }, { ...me, id: "a", role: "ADMIN" })).toBe("APPROVED")
        expect(statusForNewLeave(head, me)).toBe("APPROVED")
    })
    it("lets only the head or Admin/PC decide, never the person", () => {
        expect(canDecideLeave(head, me, "PENDING")).toBe(true)
        expect(canDecideLeave(head, me, "APPROVED")).toBe(false)
        expect(canDecideLeave(staff, me, "PENDING")).toBe(false)
        expect(canDecideLeave({ sub: "h", role: "MANAGER", departmentId: "d1" }, { ...me, id: "h", role: "MANAGER" }, "PENDING")).toBe(false)
        expect(canDecideLeave({ sub: "a", role: "PC", departmentId: null }, { ...me, id: "h", role: "MANAGER" }, "PENDING")).toBe(true)
    })
    it("lets the person withdraw a request or future leave, not leave already started", () => {
        expect(canRemoveLeave(staff, me, { status: "PENDING", startDate: "2026-11-12" }, today)).toBe(true)
        expect(canRemoveLeave(staff, me, { status: "DECLINED", startDate: "2026-11-12" }, today)).toBe(true)
        expect(canRemoveLeave(staff, me, { status: "APPROVED", startDate: "2026-11-14" }, today)).toBe(true)
        expect(canRemoveLeave(staff, me, { status: "APPROVED", startDate: "2026-11-13" }, today)).toBe(false)
        expect(canRemoveLeave(staff, { ...me, id: "u2" }, { status: "PENDING", startDate: "2026-11-14" }, today)).toBe(false)
        expect(canRemoveLeave(head, me, { status: "APPROVED", startDate: "2026-11-01" }, today)).toBe(true)
    })
})
