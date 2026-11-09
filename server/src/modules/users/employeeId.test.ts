import { describe, expect, it } from "vitest"
import { EMPLOYEE_ID_PATTERN, formatEmployeeId, normalizePrefix } from "./employeeId.js"

describe("employee ID", () => {
    it("pads the running number to four digits", () => {
        expect(formatEmployeeId("VJ", 1)).toBe("VJ-0001")
        expect(formatEmployeeId("VJ", 42)).toBe("VJ-0042")
        expect(formatEmployeeId("VJ", 12345)).toBe("VJ-12345")
    })

    it("cleans the prefix and falls back to EMP", () => {
        expect(normalizePrefix(" vj ")).toBe("VJ")
        expect(normalizePrefix("v-j!")).toBe("VJ")
        expect(normalizePrefix("")).toBe("EMP")
        expect(formatEmployeeId(null, 7)).toBe("EMP-0007")
    })

    it("accepts typed IDs with letters, numbers and dashes only", () => {
        expect(EMPLOYEE_ID_PATTERN.test("VJ-0001")).toBe(true)
        expect(EMPLOYEE_ID_PATTERN.test("-VJ")).toBe(false)
        expect(EMPLOYEE_ID_PATTERN.test("VJ 01")).toBe(false)
    })
})
