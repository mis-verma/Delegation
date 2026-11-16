import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { readTable } from "../../utils/readTable.js"
import { buildCategoryProposals, type HistoryPerson } from "./categoryHistoryImport.js"

const names = ["IT – ERP", "IT – Support", "IT – Network", "IT – Security Systems", "Admin – Facilities", "Admin – Transport", "Accounts", "HR", "Merchandising", "MIS", "Operations", "Operations Manager"]
const departments = names.map((name, i) => ({ id: `d${i}`, name }))
const idOf = (name: string) => departments.find((d) => d.name === name)!.id

const head = (departmentName: string): HistoryPerson => ({ id: `h-${departmentName}`, name: `Head of ${departmentName}`, email: `${departmentName}@x.in`, departmentId: idOf(departmentName), role: "MANAGER" })
const heads = new Map(["IT – ERP", "IT – Network", "Accounts", "HR", "Operations Manager"].map((name) => [idOf(name), head(name)] as const))

const csv = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "VJ_Issue_Ticket_Categories_Final.csv"))

describe("Issue Ticket final file with department heads", async () => {
    const records = await readTable(csv, "text/csv")
    const proposals = buildCategoryProposals(records, "Sub Category", { people: [], departments, existingNames: new Set(), heads })
    const byName = (start: string) => {
        const found = proposals.find((p) => p.name.startsWith(start))
        if (!found) throw new Error(`missing ${start}`)
        return found
    }

    it("builds 49 separate categories", () => {
        expect(proposals).toHaveLength(49)
    })

    it("fills a blank Assigned To with the department head", () => {
        expect(byName("Acme billing")).toMatchObject({ assigneeId: "h-IT – ERP", assigneeSource: "head", personName: "Head of IT – ERP" })
        expect(byName("Payslip")).toMatchObject({ assigneeId: "h-HR", assigneeSource: "head" })
        expect(byName("Cash shortage")).toMatchObject({ assigneeId: "h-Operations Manager", assigneeSource: "head" })
    })

    it("leaves nobody assigned and warns when the department has no head", () => {
        const support = byName("PC / laptop")
        expect(support).toMatchObject({ assigneeId: null, assigneeSource: "none" })
        expect(support.warnings).toContain("This department has no head, so nobody is assigned by default.")
        expect(byName("L10 / delegation")).toMatchObject({ assigneeId: null, assigneeSource: "none", departmentId: null })
    })
})
