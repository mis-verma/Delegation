import { describe, expect, it } from "vitest"
import { maintenanceBlocks } from "./auth.js"

describe("maintenance mode", () => {
    it("blocks everyone but admin, PC and owner while on", () => {
        expect(maintenanceBlocks("USER", "/tickets", true)).toBe(true)
        expect(maintenanceBlocks("MANAGER", "/tasks/", true)).toBe(true)
        expect(maintenanceBlocks("ADMIN", "/tickets", true)).toBe(false)
        expect(maintenanceBlocks("PC", "/tickets", true)).toBe(false)
    })
    it("keeps sign-in, status and own profile open", () => {
        expect(maintenanceBlocks("USER", "/auth/refresh", true)).toBe(false)
        expect(maintenanceBlocks("USER", "/settings/status", true)).toBe(false)
        expect(maintenanceBlocks("USER", "/users/me", true)).toBe(false)
    })
    it("does nothing while off", () => {
        expect(maintenanceBlocks("USER", "/tickets", false)).toBe(false)
    })
})
