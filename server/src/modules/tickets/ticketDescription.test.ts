import { describe, expect, it } from "vitest"
import { resolveDescription } from "./ticketDescription.js"

describe("resolveDescription", () => {
    it("keeps a typed description", () => {
        expect(resolveDescription({ description: "  Fan is loud ", title: "Fan", assignmentMode: "AUTO" })).toEqual({ ok: true, text: "Fan is loud" })
        expect(resolveDescription({ description: "Printer jam", title: "Printer", assignmentMode: "MANUAL" })).toEqual({ ok: true, text: "Printer jam" })
    })

    it("fills an empty Auto description from the category, subcategory and title", () => {
        expect(resolveDescription({ description: "", title: "Not cooling", assignmentMode: "AUTO", categoryName: "AC", subcategoryName: "Not working" }))
            .toEqual({ ok: true, text: "AC / Not working: Not cooling" })
        expect(resolveDescription({ description: undefined, title: "Not cooling", assignmentMode: "AUTO", categoryName: "AC" }))
            .toEqual({ ok: true, text: "AC: Not cooling" })
        expect(resolveDescription({ description: "   ", title: "Only title", assignmentMode: "AUTO" })).toEqual({ ok: true, text: "Only title" })
    })

    it("refuses an empty Manual description and one with no mode", () => {
        expect(resolveDescription({ description: "", title: "x", assignmentMode: "MANUAL" }).ok).toBe(false)
        expect(resolveDescription({ description: "", title: "x", assignmentMode: undefined }).ok).toBe(false)
    })
})
