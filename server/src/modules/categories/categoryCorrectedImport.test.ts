import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { readTable } from "../../utils/readTable.js"
import { buildCategoryProposals, pickNameColumn, type HistoryPerson } from "./categoryHistoryImport.js"

const names = ["IT", "Accounts", "Jewel Club", "Merchandising", "Admin", "HR", "Operations"]
const departments = names.map((name, i) => ({ id: `d${i}`, name }))
const idOf = (name: string) => departments.find((d) => d.name === name)!.id
const heads = new Map(names.map((name) => [idOf(name), { id: `h-${name}`, name: `Head of ${name}`, email: `${name}@x.in`, departmentId: idOf(name), role: "MANAGER" } as HistoryPerson] as const))

const csv = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "VJ_Issue_Ticket_Categories_Corrected.csv"))

describe("Corrected file with the 11 categories", async () => {
    const records = await readTable(csv, "text/csv")
    const column = pickNameColumn(records, ["Category", "Sub Category"])
    const proposals = buildCategoryProposals(records, column, { people: [], departments, existingNames: new Set(), heads })
    const category = (name: string) => proposals.find((p) => p.name === name)!

    it("keeps Category as the name with sub categories under it", () => {
        expect(column).toBe("Category")
        expect(proposals).toHaveLength(11)
        expect(proposals.reduce((n, p) => n + p.subcategories.length, 0)).toBe(49)
    })

    it("gives the category its main department and head", () => {
        expect(category("Transaction Correction")).toMatchObject({ departmentId: idOf("Accounts"), assigneeId: "h-Accounts", assigneeSource: "head" })
        expect(category("Facilities & Maintenance")).toMatchObject({ departmentId: idOf("Admin"), assigneeId: "h-Admin" })
        expect(category("HR & Employee Services")).toMatchObject({ departmentId: idOf("HR"), assigneeId: "h-HR" })
    })

    it("gives every sub category its own department head", () => {
        const subs = proposals.filter((p) => p.subcategories.length > 1).flatMap((p) => p.subcategories)
        expect(subs.every((s) => s.assigneeId !== null && s.departmentId !== null)).toBe(true)
        const savings = category("Transaction Correction").subcategories.find((s) => s.name.startsWith("Savings"))!
        expect(savings).toMatchObject({ departmentId: idOf("Jewel Club"), assigneeId: "h-Jewel Club", assigneeSource: "head" })
        const stock = category("Transaction Correction").subcategories.find((s) => s.name.startsWith("Item / tag"))!
        expect(stock).toMatchObject({ departmentId: idOf("Merchandising"), assigneeId: "h-Merchandising", tatHours: 48 })
        const extraction = category("Change & Enhancement Request").subcategories.find((s) => s.name.startsWith("Data extraction"))!
        expect(extraction).toMatchObject({ departmentId: idOf("Operations"), assigneeId: "h-Operations", tatHours: null })
    })

    it("keeps priorities per sub category", () => {
        const billing = category("ERP & App Issue").subcategories[0]!
        expect(billing).toMatchObject({ priority: "CRITICAL", tatHours: 4 })
        expect(category("Task tracker")).toMatchObject({ priority: "CRITICAL", tatHours: null, departmentId: idOf("Operations"), assigneeId: "h-Operations" })
    })

    it("falls back to the category head only when a sub department is unknown", () => {
        const withoutAdmin = buildCategoryProposals(records, column, { people: [], departments: departments.filter((d) => d.name !== "Admin"), existingNames: new Set(), heads })
        const stock = withoutAdmin.find((p) => p.name === "Vehicle & Logistics")!.subcategories[0]!
        expect(stock.departmentId).toBeNull()
        expect(stock.assigneeSource).toBe("none")
    })
})
