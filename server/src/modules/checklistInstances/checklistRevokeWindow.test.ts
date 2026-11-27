import { describe, expect, it } from "vitest"
import { REVOKE_WINDOW_MS, revokeWindowOpen } from "./checklistRevokeWindow.js"

describe("revokeWindowOpen", () => {
    it("is open at submission and up to the window's edge", () => {
        const sent = new Date("2026-01-01T00:00:00Z")
        expect(revokeWindowOpen(sent, sent.getTime())).toBe(true)
        expect(revokeWindowOpen(sent, sent.getTime() + REVOKE_WINDOW_MS)).toBe(true)
    })

    it("closes just past the window", () => {
        const sent = new Date("2026-01-01T00:00:00Z")
        expect(revokeWindowOpen(sent, sent.getTime() + REVOKE_WINDOW_MS + 1)).toBe(false)
    })

    it("is closed with no submission time", () => {
        expect(revokeWindowOpen(null)).toBe(false)
    })
})
