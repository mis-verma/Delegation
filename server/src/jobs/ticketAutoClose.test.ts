import { describe, expect, it } from "vitest"
import { AUTO_CLOSE_AFTER_DAYS, autoCloseCutoff, autoCloseNote } from "./ticketAutoClose.job.js"

describe("ticket auto-close", () => {
    it("waits three full days after hand-in", () => {
        expect(AUTO_CLOSE_AFTER_DAYS).toBe(3)
        const now = new Date("2026-11-09T12:00:00.000Z")
        expect(autoCloseCutoff(now).toISOString()).toBe("2026-11-06T12:00:00.000Z")
    })

    it("explains why the ticket closed", () => {
        expect(autoCloseNote()).toBe("Closed automatically. Nobody approved it within 3 days.")
    })
})
