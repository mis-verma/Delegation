import { describe, expect, it } from "vitest"
import { rowProblem, unknownColumnsOf, userRowsFromRecords, type OrgLookup } from "./userImport.js"

const lookup: OrgLookup = {
    departments: [{ id: "d1", name: "Sales" }, { id: "d2", name: "Accounts" }],
    stores: [{ id: "s1", name: "Solan" }, { id: "s2", name: "Rohru" }],
    existingEmails: new Set(["old@example.com"]),
}

const rowsOf = (records: Record<string, string>[]) => userRowsFromRecords(records, lookup)

describe("userRowsFromRecords", () => {
    it("maps common headers and resolves department and store by name", () => {
        const { rows } = rowsOf([{ Name: "Asha Verma", "E-mail": "Asha@Example.com", Branch: " solan ", Team: "SALES", Mobile: "+91 98765-43210", Designation: "Manager", Sex: "F" }])
        expect(rows[0]).toMatchObject({
            email: "asha@example.com", firstName: "Asha", lastName: "Verma", role: "MANAGER",
            departmentId: "d1", storeId: "s1", phone: "919876543210", gender: "FEMALE",
        })
        expect(rowProblem(rows[0]!)).toBeNull()
    })

    it("uses first and last name columns when given", () => {
        const { rows } = rowsOf([{ "First Name": "Ravi", "Last Name": "Kumar", Email: "ravi@example.com" }])
        expect(rows[0]).toMatchObject({ firstName: "Ravi", lastName: "Kumar", role: "USER" })
    })

    it("skips blank rows and counts them", () => {
        const out = rowsOf([{ Name: "", Email: "" }, { Name: "A", Email: "a@example.com" }])
        expect(out.rows).toHaveLength(1)
        expect(out.skippedEmpty).toBe(1)
    })

    it("flags every kind of problem", () => {
        const { rows } = rowsOf([
            { Name: "A", Email: "bad" },
            { Name: "B", Email: "old@example.com" },
            { Name: "C", Email: "c@example.com" },
            { Name: "C2", Email: "c@example.com" },
            { Name: "D", Email: "d@example.com", Department: "Nowhere" },
            { Name: "E", Email: "e@example.com", Store: "Mars" },
            { Name: "F", Email: "f@example.com", Phone: "12" },
            { Name: "G", Email: "g@example.com", Role: "Wizard" },
            { Name: "", Email: "h@example.com" },
        ])
        expect(rows.map(rowProblem)).toEqual([
            "Email is not valid",
            "Email already has an account",
            null,
            "Email appears twice in the file",
            'No department called "Nowhere"',
            'No store called "Mars"',
            "Phone number is not valid",
            'Role "Wizard" is not recognised',
            "Name is missing",
        ])
    })

    it("never maps to admin, owner or PC roles", () => {
        const { rows } = rowsOf([{ Name: "A", Email: "a@example.com", Role: "Admin" }, { Name: "B", Email: "b@example.com", Role: "PC" }])
        expect(rows.every((r) => !r.roleMatched)).toBe(true)
    })

    it("caps the row count", () => {
        const many = Array.from({ length: 320 }, (_, i) => ({ Name: `P${i}`, Email: `p${i}@example.com` }))
        const out = rowsOf(many)
        expect(out.rows).toHaveLength(300)
        expect(out.truncated).toBe(true)
    })
})

describe("unknownColumnsOf", () => {
    it("lists headers that were not recognised", () => {
        expect(unknownColumnsOf([{ Name: "A", Salary: "1", Email: "a@example.com" }])).toEqual(["Salary"])
    })
})
