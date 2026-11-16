import { describe, expect, it } from "vitest"
import { previousOvernightPeriod } from "./checklistInstanceGenerator.job.js"

const OFFSET = 330
const base = { recurrence: "DAILY" as const, startDate: new Date("2026-01-01T00:00:00.000Z"), occurrenceDays: null }
const localToUtc = (iso: string) => new Date(new Date(`${iso}Z`).getTime() - OFFSET * 60_000)

describe("previousOvernightPeriod", () => {
    const overnight = { ...base, opensTime: "22:00", cutoffTime: "06:00" }

    it("returns yesterday before the closing time", () => {
        const period = previousOvernightPeriod(overnight, localToUtc("2026-11-16T03:00:00"), OFFSET)
        expect(period?.periodKey).toBe("2026-11-15")
    })

    it("returns null after the closing time", () => {
        expect(previousOvernightPeriod(overnight, localToUtc("2026-11-16T07:00:00"), OFFSET)).toBeNull()
    })

    it("returns null for a same-day window", () => {
        expect(previousOvernightPeriod({ ...base, opensTime: "09:00", cutoffTime: "18:00" }, localToUtc("2026-11-16T03:00:00"), OFFSET)).toBeNull()
    })

    it("treats a midnight closing time as end of day, not overnight", () => {
        expect(previousOvernightPeriod({ ...base, opensTime: "09:00", cutoffTime: "00:00" }, localToUtc("2026-11-16T03:00:00"), OFFSET)).toBeNull()
    })

    it("returns null for non-daily checklists", () => {
        expect(previousOvernightPeriod({ ...overnight, recurrence: "WEEKLY" as never }, localToUtc("2026-11-16T03:00:00"), OFFSET)).toBeNull()
    })

    it("returns null before the start date", () => {
        expect(previousOvernightPeriod({ ...overnight, startDate: new Date("2026-11-16T00:00:00.000Z") }, localToUtc("2026-11-16T03:00:00"), OFFSET)).toBeNull()
    })
})
