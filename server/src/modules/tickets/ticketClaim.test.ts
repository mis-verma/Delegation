import { describe, expect, it } from "vitest"
import { inClaimPool } from "./ticketShared.js"

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
