import { describe, expect, it } from "vitest"
import { formatPdfCell, formatPdfDay } from "./pdf.js"

describe("formatPdfDay", () => {
    it("uses the org clock", () => {
        expect(formatPdfDay("2026-10-31T19:00:00.000Z", 330)).toBe("01 Nov 2026")
    })
})

describe("formatPdfCell", () => {
    it("formats ISO timestamps with the time", () => {
        expect(formatPdfCell("2026-10-05T08:30:00.000Z", 330)).toBe("05 Oct 2026, 14:00")
    })

    it("leaves plain text and numbers alone and blanks empties", () => {
        expect(formatPdfCell("Sales", 330)).toBe("Sales")
        expect(formatPdfCell(12.5, 330)).toBe("12.5")
        expect(formatPdfCell(null, 330)).toBe("")
        expect(formatPdfCell(undefined, 330)).toBe("")
    })
})
