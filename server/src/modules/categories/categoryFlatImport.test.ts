import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { readTable } from "../../utils/readTable.js"
import { buildCategoryProposals, pickNameColumn } from "./categoryHistoryImport.js"

const names = ["IT – ERP", "IT – Support", "IT – Network", "IT – Security Systems", "Admin – Facilities", "Admin – Transport", "Accounts", "HR", "Merchandising", "MIS", "Operations Manager"]
const departments = names.map((name, i) => ({ id: `d${i}`, name }))
const idOf = (name: string) => departments.find((d) => d.name === name)!.id

const csv = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "VJ_Issue_Ticket_Import_Format.csv"))

describe("Issue Ticket file read as 49 separate categories", async () => {
    const records = await readTable(csv, "text/csv")

    it("picks Sub Category as the name when Category has one value", () => {
        expect(pickNameColumn(records, ["Category", "Sub Category"])).toBe("Sub Category")
        expect(pickNameColumn([{ Category: "A", "Sub Category": "x" }, { Category: "B", "Sub Category": "y" }], ["Category", "Sub Category"])).toBe("Category")
        expect(pickNameColumn(records, ["Category"])).toBe("Category")
    })

    const proposals = buildCategoryProposals(records, "Sub Category", { people: [], departments, existingNames: new Set() })
    const byName = (start: string) => {
        const found = proposals.find((p) => p.name.startsWith(start))
        if (!found) throw new Error(`missing ${start}`)
        return found
    }

    it("builds 49 categories with one row each and no subcategories", () => {
        expect(proposals).toHaveLength(49)
        expect(proposals.every((p) => p.rowCount === 1 && p.subcategories.length === 0)).toBe(true)
        expect(new Set(proposals.map((p) => p.name)).size).toBe(49)
    })

    it("keeps every column on each category", () => {
        const billing = byName("Acme billing")
        expect(billing).toMatchObject({ departmentId: idOf("IT – ERP"), departmentMatch: "exact", priority: "CRITICAL", tatHours: 4, assigneeId: null })
        expect(billing.labels.map((l) => l.name)).toEqual(["Issue Ticket", "ERP & App Issue", "Incident"])
        expect(byName("Item / tag")).toMatchObject({ departmentId: idOf("Merchandising"), priority: "MEDIUM", tatHours: 48 })
        expect(byName("New device")).toMatchObject({ departmentId: idOf("IT – Support"), priority: "LOW", tatHours: 168 })
        expect(byName("Cash shortage")).toMatchObject({ departmentId: idOf("Operations Manager"), priority: "CRITICAL", tatHours: 4 })
        expect(byName("Cash shortage").labels.map((l) => l.name)).toEqual(["Issue Ticket", "Security & Loss Incident", "Incident – Confidential"])
    })

    it("leaves blank fields empty", () => {
        expect(byName("Data extraction")).toMatchObject({ departmentId: idOf("MIS"), priority: "LOW", tatHours: null })
        const tracker = byName("L10 / delegation")
        expect(tracker).toMatchObject({ departmentId: null, priority: null, tatHours: null })
        expect(tracker.labels.map((l) => l.name)).toEqual(["Issue Ticket", "Not a ticket → Task tracker", "Block in tool"])
    })
})
