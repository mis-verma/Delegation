import { describe, expect, it } from "vitest"
import { normalizePhone } from "./phone.js"

describe("normalizePhone", () => {
    it("keeps digits only and drops the plus sign", () => {
        expect(normalizePhone("+91 98765-43210")).toBe("919876543210")
    })

    it("treats an empty value as no phone", () => {
        expect(normalizePhone("")).toBeNull()
        expect(normalizePhone(undefined)).toBeNull()
    })

    it("rejects numbers that are too short or contain letters", () => {
        expect(() => normalizePhone("12345")).toThrow()
        expect(() => normalizePhone("98765abcde")).toThrow()
    })
})
