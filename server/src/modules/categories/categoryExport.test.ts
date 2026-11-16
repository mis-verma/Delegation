import { describe, expect, it } from "vitest"
import { CATEGORY_FILE_COLUMNS, categoryFileRows } from "./categoryExport.js"

describe("categoryFileRows", () => {
    const rows = categoryFileRows([
        { name: "Printer", tatHours: 24, priority: "HIGH", department: { name: "IT Department" }, assignees: [{ email: "a@x.in" }, { email: "b@x.in" }], subcategories: [{ name: "Toner" }, { name: "Jam" }] },
        { name: "Bank change", tatHours: null, priority: null, department: null, assignees: [], subcategories: [] },
    ])
    it("writes one row per sub category and one row for a category without any", () => {
        expect(rows).toHaveLength(3)
        expect(rows[0]).toMatchObject({ category: "Printer", subCategory: "Toner", department: "IT Department", assignedTo: "a@x.in, b@x.in", priority: "HIGH", dueHours: 24 })
        expect(rows[2]).toMatchObject({ category: "Bank change", subCategory: "", department: "", assignedTo: "", priority: "", dueHours: "" })
    })
    it("writes each sub category's own values over the category values", () => {
        const out = categoryFileRows([
            {
                name: "Issue", tatHours: 24, priority: "MEDIUM", department: { name: "IT" }, assignees: [{ email: "a@x.in" }],
                subcategories: [
                    { name: "Own", priority: "CRITICAL", tatHours: 4, departmentName: "Accounts", assigneeEmail: "z@x.in" },
                    { name: "Plain", priority: null, tatHours: null, departmentName: null, assigneeEmail: null },
                ],
            },
        ])
        expect(out[0]).toMatchObject({ subCategory: "Own", department: "Accounts", assignedTo: "z@x.in", priority: "CRITICAL", dueHours: 4 })
        expect(out[1]).toMatchObject({ subCategory: "Plain", department: "IT", assignedTo: "a@x.in", priority: "MEDIUM", dueHours: 24 })
    })
    it("uses the same column order as the import file", () => {
        expect(CATEGORY_FILE_COLUMNS.map((c) => c.label)).toEqual(["Category", "Sub Category", "Department", "Assigned To", "Priority", "Due Hours"])
    })
})
