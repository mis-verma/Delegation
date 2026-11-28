import { describe, expect, it } from "vitest"
import { wholePctCell } from "./checklistReport.service.js"

describe("wholePctCell", () => {
    it("rounds to whole numbers", () => {
        expect(wholePctCell(85.7)).toBe(86)
        expect(wholePctCell(85.4)).toBe(85)
    })

    it("keeps 100 and 0 only for exact values", () => {
        expect(wholePctCell(99.6)).toBe(99)
        expect(wholePctCell(100)).toBe(100)
        expect(wholePctCell(0.4)).toBe(1)
        expect(wholePctCell(0)).toBe(0)
    })
})
