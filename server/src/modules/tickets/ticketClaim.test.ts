import { describe, expect, it } from "vitest"
import { awaitingAssigneeClaim, awaitingClaim, claimHandOff, headClaimBlock, inClaimPool } from "./ticketShared.js"

const base = { claimOpenedAt: new Date(), assigneeId: null, status: "OPEN" as const, awaitingHeadApproval: false, declinedAt: null }

describe("inClaimPool", () => {
    it("is open when the head opened it and nobody has it", () => {
        expect(inClaimPool(base)).toBe(true)
    })

    it("is closed once someone has it", () => {
        expect(inClaimPool({ ...base, assigneeId: "u1" })).toBe(false)
    })

    it("is closed while the head still has to set the time", () => {
        expect(inClaimPool({ ...base, awaitingHeadApproval: true })).toBe(false)
    })

    it("is closed for a declined ticket", () => {
        expect(inClaimPool({ ...base, declinedAt: new Date() })).toBe(false)
    })

    it("is closed when the ticket was never opened for claim", () => {
        expect(inClaimPool({ ...base, claimOpenedAt: null })).toBe(false)
    })

    it("is closed once work has moved on", () => {
        expect(inClaimPool({ ...base, status: "IN_PROGRESS" })).toBe(false)
    })
})

describe("awaitingClaim", () => {
    const offered = { ...base, claimedAt: null }

    it("waits for the pool or the named person until someone claims", () => {
        expect(awaitingClaim(offered)).toBe(true)
        expect(awaitingClaim({ ...offered, assigneeId: "u1" })).toBe(true)
        expect(awaitingAssigneeClaim({ ...offered, assigneeId: "u1" })).toBe(true)
        expect(awaitingAssigneeClaim(offered)).toBe(false)
    })

    it("stops once claimed, declined, gated or never offered", () => {
        expect(awaitingClaim({ ...offered, claimedAt: new Date() })).toBe(false)
        expect(awaitingClaim({ ...offered, declinedAt: new Date() })).toBe(false)
        expect(awaitingClaim({ ...offered, awaitingHeadApproval: true })).toBe(false)
        expect(awaitingClaim({ ...offered, claimOpenedAt: null })).toBe(false)
    })
})

describe("claimHandOff", () => {
    const now = new Date("2026-11-13T10:00:00Z")

    it("asks the named person to claim, with no clock yet", () => {
        expect(claimHandOff("u1", "head", 8, now)).toEqual({ claimOpenedAt: now, claimedAt: null, tatDueAt: null })
    })

    it("counts it as claimed when the head gives it to themselves", () => {
        expect(claimHandOff("head", "head", 8, now)).toEqual({ claimOpenedAt: now, claimedAt: now, tatDueAt: new Date("2026-11-13T18:00:00Z") })
    })
})

describe("headClaimBlock", () => {
    it("blocks a second head but not the claimer, Admin or PC", () => {
        expect(headClaimBlock({ headClaimedBy: "h1" }, "h2", false)).toBe(true)
        expect(headClaimBlock({ headClaimedBy: "h1" }, "h1", false)).toBe(false)
        expect(headClaimBlock({ headClaimedBy: "h1" }, "pc", true)).toBe(false)
        expect(headClaimBlock({ headClaimedBy: null }, "h2", false)).toBe(false)
    })
})
