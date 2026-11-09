import { describe, expect, it } from "vitest"
import { DEFAULT_AUTO_CLOSE_DAYS, autoCloseCutoff, autoCloseDaysFrom, autoCloseNote } from "./autoCloseRules.js"

describe("auto-close rules", () => {
    it("defaults to three days and waits full days after hand-in", () => {
        expect(DEFAULT_AUTO_CLOSE_DAYS).toBe(3)
        const now = new Date("2026-11-09T12:00:00.000Z")
        expect(autoCloseCutoff(now, 3).toISOString()).toBe("2026-11-06T12:00:00.000Z")
        expect(autoCloseCutoff(now, 1).toISOString()).toBe("2026-11-08T12:00:00.000Z")
    })

    it("treats 0 or missing as off and caps at 30", () => {
        expect(autoCloseDaysFrom(0)).toBeNull()
        expect(autoCloseDaysFrom(null)).toBeNull()
        expect(autoCloseDaysFrom(-2)).toBeNull()
        expect(autoCloseDaysFrom(5)).toBe(5)
        expect(autoCloseDaysFrom(99)).toBe(30)
    })

    it("explains why it closed, in plain words", () => {
        expect(autoCloseNote(3)).toBe("Closed automatically. Nobody approved it within 3 days.")
        expect(autoCloseNote(1)).toBe("Closed automatically. Nobody approved it within 1 day.")
    })
})
