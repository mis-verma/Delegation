import { describe, expect, it } from "vitest"
import { REVOKE_WINDOW_MS, revokeWindowOpen } from "./checklistRevokeWindow.js"

describe("revokeWindowOpen", () => {
    const sent = new Date("2026-11-10T10:00:00Z")
    it("is open for ten minutes after submit", () => {
        expect(revokeWindowOpen(sent, sent.getTime())).toBe(true)
        expect(revokeWindowOpen(sent, sent.getTime() + REVOKE_WINDOW_MS)).toBe(true)
    })
    it("closes after ten minutes", () => {
        expect(revokeWindowOpen(sent, sent.getTime() + REVOKE_WINDOW_MS + 1)).toBe(false)
    })
    it("is closed when nothing was submitted", () => {
        expect(revokeWindowOpen(null)).toBe(false)
    })
})
