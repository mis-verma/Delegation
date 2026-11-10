import { describe, expect, it } from "vitest"
import { CATEGORY_FILE_COLUMNS, categoryFileRows } from "./categoryExport.js"

describe("categoryFileRows", () => {
    const rows = categoryFileRows([
        { name: "Printer", tatHours: 24, priority: "HIGH", department: { name: "IT Department" }, assignees: [{ email: "a@x.in" }, { email: "b@x.in" }], tags: [{ name: "Hardware" }], subcategories: [{ name: "Toner" }, { name: "Jam" }] },
        { name: "Bank change", tatHours: null, priority: null, department: null, assignees: [], tags: [], subcategories: [] },
    ])
    it("writes one row per sub category and one row for a category without any", () => {
        expect(rows).toHaveLength(3)
        expect(rows[0]).toMatchObject({ category: "Printer", subCategory: "Toner", department: "IT Department", assignedTo: "a@x.in, b@x.in", labels: "Hardware", priority: "HIGH", dueHours: 24 })
        expect(rows[2]).toMatchObject({ category: "Bank change", subCategory: "", department: "", assignedTo: "", labels: "", priority: "", dueHours: "" })
    })
    it("uses the same column order as the import file", () => {
        expect(CATEGORY_FILE_COLUMNS.map((c) => c.label)).toEqual(["Category", "Sub Category", "Department", "Assigned To", "Labels", "Priority", "Due Hours"])
    })
})
