import { describe, expect, it } from "vitest"
import { dayRange } from "./cleanupDays.js"

describe("dayRange", () => {
    it("includes the whole last day", () => {
        const { from, to } = dayRange("2026-11-01", "2026-11-10")
        expect(from?.toISOString()).toBe("2026-11-01T00:00:00.000Z")
        expect(to?.toISOString()).toBe("2026-11-11T00:00:00.000Z")
    })

    it("covers one day when start and end are the same", () => {
        const { from, to } = dayRange("2026-11-05", "2026-11-05")
        expect(to!.getTime() - from!.getTime()).toBe(86_400_000)
    })

    it("leaves out missing ends", () => {
        expect(dayRange(undefined, undefined)).toEqual({})
        expect(dayRange(undefined, "2026-11-05").from).toBeUndefined()
    })
})
