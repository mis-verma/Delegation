import { describe, expect, it } from "vitest"
import { parseDueDate, resolveDueHours } from "./ticketBulkImport.service.js"

describe("import due date", () => {
    it("reads ISO and day-first dates at 6 pm org time", () => {
        expect(parseDueDate("2030-11-06")?.toISOString()).toBe("2030-11-06T12:30:00.000Z")
        expect(parseDueDate("06/11/2030")?.toISOString()).toBe("2030-11-06T12:30:00.000Z")
        expect(parseDueDate("6-11-30")?.toISOString()).toBe("2030-11-06T12:30:00.000Z")
    })
    it("reads a written month with a year", () => {
        expect(parseDueDate("6 Nov 2030")?.toISOString()).toBe("2030-11-06T12:30:00.000Z")
    })
    it("rejects dates that do not exist", () => {
        expect(parseDueDate("2030-02-31")).toBeNull()
        expect(parseDueDate("31/13/2030")).toBeNull()
        expect(parseDueDate("soon")).toBeNull()
    })
    it("turns a future date into hours and refuses the past", () => {
        const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
        const future = resolveDueHours(soon)
        expect(future.invalid).toBe(false)
        expect(future.tatHours).toBeGreaterThan(0)
        expect(resolveDueHours("2000-01-01").invalid).toBe(true)
    })
})
