import { describe, expect, it } from "vitest"
import { MAX_COVER_DAYS, isCoverEligibleRole, validateCoverWindow } from "./approvalCoverRules.js"
import { coverCanVerify } from "../checklistInstances/checklistVerifyRules.js"
import { borrowAuthority } from "./borrowAuthority.js"

const NOW = new Date("2026-10-28T10:00:00Z")
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

describe("validateCoverWindow", () => {
    it("accepts a normal leave window", () => {
        expect(validateCoverWindow(NOW, day(7), NOW)).toBeNull()
    })

    it("rejects a window that already ended or ends before it starts", () => {
        expect(validateCoverWindow(day(-5), day(-1), NOW)).not.toBeNull()
        expect(validateCoverWindow(day(3), day(2), NOW)).not.toBeNull()
    })

    it("rejects a window longer than the cap", () => {
        expect(validateCoverWindow(NOW, day(MAX_COVER_DAYS + 1), NOW)).not.toBeNull()
        expect(validateCoverWindow(NOW, day(MAX_COVER_DAYS), NOW)).toBeNull()
    })

    it("rejects invalid dates", () => {
        expect(validateCoverWindow(new Date("nope"), day(2), NOW)).not.toBeNull()
    })
})

describe("isCoverEligibleRole", () => {
    it("only lets approver roles give or receive a cover", () => {
        expect(["ADMIN", "PC", "MANAGER", "SENIOR"].every((r) => isCoverEligibleRole(r as never))).toBe(true)
        expect(isCoverEligibleRole("USER")).toBe(false)
        expect(isCoverEligibleRole("AGENT")).toBe(false)
        expect(isCoverEligibleRole("OWNER")).toBe(false)
    })
})

describe("coverCanVerify", () => {
    const sales = new Set(["dept-sales"])

    it("lets a cover for a head approve that head's department only", () => {
        const head = { id: "h1", role: "MANAGER" as const, departmentId: "dept-sales" }
        const otherHead = { id: "h2", role: "MANAGER" as const, departmentId: "dept-accounts" }
        expect(coverCanVerify(head, sales, [])).toBe(true)
        expect(coverCanVerify(otherHead, sales, [])).toBe(false)
    })

    it("lets a cover for PC or Admin approve anything", () => {
        expect(coverCanVerify({ id: "p1", role: "PC", departmentId: null }, sales, [])).toBe(true)
        expect(coverCanVerify({ id: "a1", role: "ADMIN", departmentId: null }, new Set(), [])).toBe(true)
    })

    it("follows a named reviewer", () => {
        const head = { id: "h3", role: "SENIOR" as const, departmentId: "dept-other" }
        expect(coverCanVerify(head, sales, ["h3"])).toBe(true)
    })

    it("gives nothing when the person covered cannot approve", () => {
        expect(coverCanVerify({ id: "u1", role: "USER", departmentId: "dept-sales" }, sales, [])).toBe(false)
    })
})

describe("borrowAuthority", () => {
    it("keeps the real person but borrows role and department, and never lends Admin", () => {
        const me = { sub: "delegate-1", role: "SENIOR" as const, departmentId: "dept-a", storeId: "store-a" }
        const head = borrowAuthority(me, { id: "h1", role: "MANAGER", departmentId: "dept-b", storeId: null })
        expect(head).toMatchObject({ sub: "delegate-1", role: "MANAGER", departmentId: "dept-b" })
        expect(head.storeId).toBeUndefined()
        const admin = borrowAuthority(me, { id: "a1", role: "ADMIN", departmentId: null, storeId: null })
        expect(admin.role).toBe("PC")
        expect(admin.sub).toBe("delegate-1")
    })
})
