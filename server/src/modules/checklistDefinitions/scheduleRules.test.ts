import { describe, expect, it } from "vitest"
import { isBeforeToday, isOvernightWindow, lateWindowProblem, sameLocalDate, sameOpenAndCloseProblem, windowTimesFor } from "./lateWindow.js"
import { runDeadlineMs } from "../checklistInstances/checklistRunEnd.js"
import { createChecklistDefinitionSchema } from "./checklistDefinition.validation.js"

describe("isOvernightWindow", () => {
    it("flags a close earlier than the open", () => {
        expect(isOvernightWindow("22:00", "06:00")).toBe(true)
    })

    it("treats 00:00 as end of day", () => {
        expect(isOvernightWindow("09:00", "00:00")).toBe(false)
    })

    it("is false without both times", () => {
        expect(isOvernightWindow(null, "06:00")).toBe(false)
        expect(isOvernightWindow("22:00", null)).toBe(false)
    })
})

describe("lateWindowProblem with a midnight close", () => {
    it("rejects a late window", () => {
        expect(lateWindowProblem({ recurrence: "DAILY", opensTime: "09:00", cutoffTime: "00:00", lateUntilTime: "01:00" })).toMatch(/end of the day/)
    })
})

describe("windowTimesFor", () => {
    it("keeps times for daily and one-time", () => {
        expect(windowTimesFor("DAILY", { opensTime: "09:00", cutoffTime: "18:00" })).toEqual({ opensTime: "09:00", cutoffTime: "18:00", lateUntilTime: null })
        expect(windowTimesFor("ONE_TIME", { opensTime: "09:00" }).opensTime).toBe("09:00")
    })

    it("nulls times for other recurrences", () => {
        expect(windowTimesFor("WEEKLY", { opensTime: "09:00", cutoffTime: "18:00", lateUntilTime: "20:00" })).toEqual({ opensTime: null, cutoffTime: null, lateUntilTime: null })
    })
})

describe("sameOpenAndCloseProblem", () => {
    it("rejects equal times only", () => {
        expect(sameOpenAndCloseProblem({ opensTime: "09:00", cutoffTime: "09:00" })).not.toBeNull()
        expect(sameOpenAndCloseProblem({ opensTime: "09:00", cutoffTime: "10:00" })).toBeNull()
        expect(sameOpenAndCloseProblem({ opensTime: "09:00" })).toBeNull()
    })
})

describe("date helpers", () => {
    it("compares local dates with the org offset", () => {
        const now = new Date("2026-11-16T20:00:00.000Z")
        expect(isBeforeToday(new Date("2026-11-16T00:00:00.000Z"), now, 330)).toBe(true)
        expect(isBeforeToday(new Date("2026-11-17T00:00:00.000Z"), now, 330)).toBe(false)
        expect(sameLocalDate(new Date("2026-11-17T00:00:00.000Z"), new Date("2026-11-17T10:00:00.000Z"), 330)).toBe(true)
    })
})

describe("runDeadlineMs with midnight close", () => {
    const periodStart = new Date("2026-11-16T00:00:00.000Z")
    const periodEnd = new Date("2026-11-17T00:00:00.000Z")

    it("closes at the end of the day", () => {
        expect(runDeadlineMs({ periodStart, periodEnd, opensTime: "09:00", cutoffTime: "00:00" }, 0)).toBe(periodEnd.getTime())
    })

    it("rolls overnight windows to the next morning", () => {
        expect(runDeadlineMs({ periodStart, periodEnd, opensTime: "22:00", cutoffTime: "06:00" }, 0)).toBe(periodEnd.getTime() + 6 * 3_600_000)
    })
})

describe("createChecklistDefinitionSchema", () => {
    const valid = {
        name: "Opening",
        storeIds: ["s1"],
        recurrence: "DAILY" as const,
        startDate: "2026-11-16T00:00:00.000Z",
        assigneeIds: [],
        items: [{ label: "Check" }],
    }

    it("accepts different open and close times", () => {
        expect(createChecklistDefinitionSchema.safeParse({ ...valid, opensTime: "09:00", cutoffTime: "18:00" }).success).toBe(true)
    })

    it("rejects equal open and close times", () => {
        expect(createChecklistDefinitionSchema.safeParse({ ...valid, opensTime: "09:00", cutoffTime: "09:00" }).success).toBe(false)
    })
})
