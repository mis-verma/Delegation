import { describe, expect, it } from "vitest"
import { NO_EMAIL, NO_PROOF, assertLoginCodeChangeAllowed, turningLoginCodeOn } from "./loginCodeGuard.js"

const off = { requireAdminLoginCode: false }
const on = { requireAdminLoginCode: true }

describe("admin sign-in code guard", () => {
    it("only counts a real off to on change", () => {
        expect(turningLoginCodeOn({ requireAdminLoginCode: true }, off)).toBe(true)
        expect(turningLoginCodeOn({ requireAdminLoginCode: true }, on)).toBe(false)
        expect(turningLoginCodeOn({ requireAdminLoginCode: false }, on)).toBe(false)
        expect(turningLoginCodeOn({}, off)).toBe(false)
    })

    it("refuses to turn it on when email is not set up", () => {
        expect(() => assertLoginCodeChangeAllowed({ requireAdminLoginCode: true, loginCodeProof: "123456" }, off, false)).toThrowError(NO_EMAIL)
    })

    it("refuses to turn it on without a code the admin just received", () => {
        expect(() => assertLoginCodeChangeAllowed({ requireAdminLoginCode: true }, off, true)).toThrowError(NO_PROOF)
    })

    it("allows it once the admin proves the code arrived", () => {
        expect(() => assertLoginCodeChangeAllowed({ requireAdminLoginCode: true, loginCodeProof: "123456" }, off, true)).not.toThrow()
    })

    it("never blocks turning it off, or saving other settings", () => {
        expect(() => assertLoginCodeChangeAllowed({ requireAdminLoginCode: false }, on, false)).not.toThrow()
        expect(() => assertLoginCodeChangeAllowed({}, on, false)).not.toThrow()
    })
})
