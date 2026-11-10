import { describe, expect, it } from "vitest"
import { buildCategoryProposals, hoursFromHours, hoursFromSlaMinutes } from "./categoryHistoryImport.js"

const people = [
    { id: "u1", name: "Nitin Jain", email: "nitin@x.in", departmentId: "d-it" },
    { id: "u2", name: "Shruti Thakur", email: "shruti@x.in", departmentId: "d-it" },
    { id: "u3", name: "Arun Chandel", email: "arun@x.in", departmentId: "d-acc" },
]
const departments = [
    { id: "d-it", name: "IT Department" },
    { id: "d-acc", name: "Accounts Department" },
]

const row = (name: string, sla: string, by: string, dept = "") => ({
    "Sub Category (Filled)": name,
    "SLA (Min)": sla,
    "Completed By (Claimed By)": by,
    "Store / Department": dept,
})

describe("hoursFromSlaMinutes", () => {
    it("rounds minutes to hours and ignores missing values", () => {
        expect(hoursFromSlaMinutes("1439")).toBe(24)
        expect(hoursFromSlaMinutes("4319")).toBe(72)
        expect(hoursFromSlaMinutes("30")).toBe(1)
        expect(hoursFromSlaMinutes("")).toBeNull()
        expect(hoursFromSlaMinutes("0")).toBeNull()
        expect(hoursFromSlaMinutes("999999999")).toBeNull()
    })
})

describe("category list file", () => {
    const list = [
        { Category: "Printer not working", Department: "IT Department", "Assigned To": "nitin@x.in", "Due Hours": "24" },
        { Category: "Bank change", Department: "Accounts Department", "Assigned To": "", "Due Hours": "" },
    ]
    const proposals = buildCategoryProposals(list, "Category", { people, departments, existingNames: new Set() })
    it("reads due hours and a person by email", () => {
        const printer = proposals.find((p) => p.name === "Printer not working")!
        expect(printer.tatHours).toBe(24)
        expect(printer.assigneeId).toBe("u1")
        expect(printer.departmentId).toBe("d-it")
    })
    it("finds the department from its column when no person is given", () => {
        const bank = proposals.find((p) => p.name === "Bank change")!
        expect(bank.assigneeId).toBeNull()
        expect(bank.departmentId).toBe("d-acc")
        expect(bank.tatHours).toBeNull()
    })
    it("rounds whole hours and rejects nonsense", () => {
        expect(hoursFromHours("36")).toBe(36)
        expect(hoursFromHours("0")).toBeNull()
        expect(hoursFromHours("abc")).toBeNull()
    })
})

describe("buildCategoryProposals", () => {
    const records = [
        row("Printer not working / setup", "1439", "Nitin Jain"),
        row("Printer not working / setup", "1440", "Nitin Jain"),
        row("Printer not working / setup", "300", "Shruti Thakur"),
        row("printer not working / setup ", "", "Nitin Jain"),
        row("Bank change", "60", "Arun Chandel"),
        row("Not set in source", "100", "Arun Chandel"),
        row("", "100", "Arun Chandel"),
        row("Wifi issue", "", "Somebody Else", "IT Department"),
    ]
    const proposals = buildCategoryProposals(records, "Sub Category (Filled)", { people, departments, existingNames: new Set(["bank change"]) })
    const byName = (name: string) => proposals.find((p) => p.name === name)!

    it("groups rows that differ only by case and spacing", () => {
        expect(byName("Printer not working / setup").rowCount).toBe(4)
        expect(proposals.map((p) => p.name)).not.toContain("printer not working / setup ")
    })
    it("drops empty and unusable names", () => {
        expect(proposals.find((p) => p.name.toLowerCase() === "not set in source")).toBeUndefined()
        expect(proposals).toHaveLength(3)
    })
    it("takes the usual deadline in whole hours", () => {
        expect(byName("Printer not working / setup").tatHours).toBe(24)
    })
    it("uses the person who closes most as the person and their department as the team", () => {
        const printer = byName("Printer not working / setup")
        expect(printer.assigneeId).toBe("u1")
        expect(printer.departmentId).toBe("d-it")
        expect(printer.departmentSource).toBe("person")
        expect(byName("Bank change").departmentId).toBe("d-acc")
    })
    it("falls back to the department column when the person is unknown", () => {
        const wifi = byName("Wifi issue")
        expect(wifi.assigneeId).toBeNull()
        expect(wifi.departmentId).toBe("d-it")
        expect(wifi.departmentSource).toBe("column")
        expect(wifi.tatHours).toBeNull()
    })
    it("flags categories that already exist and sorts the busiest first", () => {
        expect(byName("Bank change").exists).toBe(true)
        expect(byName("Printer not working / setup").exists).toBe(false)
        expect(proposals[0]!.name).toBe("Printer not working / setup")
    })
})

describe("category file with sub category, labels and priority", () => {
    const tags = [{ id: "t1", name: "Hardware" }]
    const existing = new Map([["printer not working", { id: "c1", subcategoryKeys: new Set(["toner"]) }]])
    const file = [
        { Category: "Printer not working", "Sub Category": "Toner", Department: "IT Department", "Assigned To": "nitin@x.in", Labels: "Hardware, Urgent", Priority: "high", "Due Hours": "24" },
        { Category: "Printer not working", "Sub Category": "Paper jam", Department: "IT Department", "Assigned To": "", Labels: "", Priority: "", "Due Hours": "" },
        { Category: "Bank change", "Sub Category": "", Department: "Accounts Department", "Assigned To": "ghost@x.in", Labels: "", Priority: "urgent", "Due Hours": "48" },
    ]
    const proposals = buildCategoryProposals(file, "Category", { people, departments, existingNames: new Set(["printer not working"]), existing, tags })
    const printer = proposals.find((p) => p.name === "Printer not working")!
    const bank = proposals.find((p) => p.name === "Bank change")!

    it("collects each sub category once and marks the ones already saved", () => {
        expect(printer.subcategories).toEqual([{ name: "Toner", exists: true }, { name: "Paper jam", exists: false }])
        expect(printer.existingCategoryId).toBe("c1")
        expect(bank.subcategories).toEqual([])
    })
    it("matches labels to saved ones and keeps unknown names", () => {
        expect(printer.labels).toEqual([{ name: "Hardware", tagId: "t1" }, { name: "Urgent", tagId: null }])
    })
    it("reads priority and warns about a value it cannot use", () => {
        expect(printer.priority).toBe("HIGH")
        expect(bank.priority).toBeNull()
        expect(bank.warnings.some((w) => w.includes("urgent"))).toBe(true)
    })
    it("warns when the person is not found", () => {
        expect(bank.assigneeId).toBeNull()
        expect(bank.warnings.some((w) => w.includes("ghost@x.in"))).toBe(true)
    })
    it("trusts an exact department column over the person's own department", () => {
        const odd = buildCategoryProposals(
            [{ Category: "Billing", Department: "Accounts Department", "Assigned To": "nitin@x.in", "Due Hours": "" }],
            "Category",
            { people, departments, existingNames: new Set() },
        )[0]!
        expect(odd.departmentId).toBe("d-acc")
        expect(odd.assigneeId).toBe("u1")
    })
})
