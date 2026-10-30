import { describe, expect, it } from "vitest"
import { SEND_BACK_GRACE_MS, sendBackGraceEnded } from "./checklistSendBackBlock.js"

describe("sendBackGraceEnded", () => {
    const now = Date.parse("2026-10-30T12:00:00Z")

    it("does not block a run that has no send-back time", () => {
        expect(sendBackGraceEnded(null, now)).toBe(false)
    })

    it("gives a grace period right after the send-back", () => {
        expect(sendBackGraceEnded(new Date(now - 60_000), now)).toBe(false)
        expect(sendBackGraceEnded(new Date(now - SEND_BACK_GRACE_MS + 1), now)).toBe(false)
    })

    it("blocks once the grace period has passed", () => {
        expect(sendBackGraceEnded(new Date(now - SEND_BACK_GRACE_MS), now)).toBe(true)
        expect(sendBackGraceEnded(new Date(now - 5 * SEND_BACK_GRACE_MS), now)).toBe(true)
    })
})
