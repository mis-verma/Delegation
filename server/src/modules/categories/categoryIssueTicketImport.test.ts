import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { readTable } from "../../utils/readTable.js"
import { buildCategoryProposals } from "./categoryHistoryImport.js"

const names = ["IT – ERP", "IT – Support", "IT – Network", "IT – Security Systems", "Admin – Facilities", "Admin – Transport", "Accounts", "HR", "Merchandising", "MIS", "Operations Manager"]
const departments = names.map((name, i) => ({ id: `d${i}`, name }))
const idOf = (name: string) => departments.find((d) => d.name === name)!.id

const csv = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "VJ_Issue_Ticket_Import_Format.csv"))

describe("Issue Ticket list import", async () => {
    const records = await readTable(csv, "text/csv")
    const proposals = buildCategoryProposals(records, "Category", { people: [], departments, existingNames: new Set() })
    const proposal = proposals[0]!
    const sub = (start: string) => {
        const found = proposal.subcategories.find((s) => s.name.startsWith(start))
        if (!found) throw new Error(`missing ${start}`)
        return found
    }

    it("builds one category with 49 subcategories", () => {
        expect(proposals).toHaveLength(1)
        expect(proposal.name).toBe("Issue Ticket")
        expect(proposal.subcategories).toHaveLength(49)
    })

    it("keeps category time and labels empty because rows differ", () => {
        expect(proposal.tatHours).toBeNull()
        expect(proposal.labels).toEqual([])
    })

    it("maps per-row values", () => {
        expect(sub("Acme billing")).toMatchObject({ departmentId: idOf("IT – ERP"), priority: "CRITICAL", tatHours: 4 })
        expect(sub("Acme billing").labels.map((l) => l.name)).toEqual(["ERP & App Issue", "Incident"])
        expect(sub("Login, user ID")).toMatchObject({ departmentId: idOf("IT – ERP"), priority: "HIGH", tatHours: 24 })
        expect(sub("Wrong transaction")).toMatchObject({ departmentId: idOf("Accounts"), priority: "MEDIUM", tatHours: 24 })
        expect(sub("Item / tag")).toMatchObject({ departmentId: idOf("Merchandising"), tatHours: 48 })
        expect(sub("Peripherals")).toMatchObject({ departmentId: idOf("IT – Support"), priority: "MEDIUM", tatHours: 72 })
        expect(sub("New device")).toMatchObject({ priority: "LOW", tatHours: 168 })
        expect(sub("Internet / Wi-Fi")).toMatchObject({ departmentId: idOf("IT – Network"), priority: "CRITICAL", tatHours: 4 })
        expect(sub("CCTV offline")).toMatchObject({ departmentId: idOf("IT – Security Systems"), tatHours: 4 })
        expect(sub("Strongroom / shutter")).toMatchObject({ departmentId: idOf("Admin – Facilities"), priority: "CRITICAL" })
        expect(sub("Stock movement – inter-store")).toMatchObject({ departmentId: idOf("Admin – Transport"), priority: "HIGH", tatHours: 4 })
        expect(sub("Payslip")).toMatchObject({ departmentId: idOf("HR"), tatHours: 72 })
        expect(sub("Data extraction")).toMatchObject({ departmentId: idOf("MIS"), priority: "LOW", tatHours: null })
        expect(sub("Cash shortage")).toMatchObject({ departmentId: idOf("Operations Manager"), priority: "CRITICAL", tatHours: 4 })
        expect(sub("Cash shortage").labels.map((l) => l.name)).toEqual(["Security & Loss Incident", "Incident – Confidential"])
    })

    it("leaves unmatched departments empty with a warning", () => {
        const savings = sub("Savings scheme")
        expect(savings).toMatchObject({ departmentId: null, departmentName: "Jewel Club + Accounts", priority: "MEDIUM", tatHours: 24 })
        const report = sub("New / modified report")
        expect(report).toMatchObject({ departmentId: null, departmentName: "IT – ERP / MIS", priority: "LOW", tatHours: null })
        expect(proposal.warnings).toContain(`Row "${savings.name}": department "Jewel Club + Accounts" is not an existing department, so it uses the category's department.`)
        expect(proposal.warnings).toContain(`Row "${report.name}": department "IT – ERP / MIS" is not an existing department, so it uses the category's department.`)
    })

    it("handles the row with no department, priority or hours", () => {
        const l10 = sub("L10 / delegation")
        expect(l10).toMatchObject({ departmentId: null, departmentName: null, priority: null, tatHours: null })
        expect(l10.labels.map((l) => l.name)).toEqual(["Not a ticket → Task tracker", "Block in tool"])
        expect(proposal.warnings.filter((w) => w.includes("L10"))).toEqual([])
    })

    it("lists exactly the two unmatched department warnings", () => {
        expect(proposal.warnings).toHaveLength(2)
    })
})
