import { describe, expect, it } from "vitest"
import { adminOnlySettingsIn } from "./settings/settingsAccess.js"
import { adminOnlyUserFieldsIn } from "./users/userAccess.js"
import { auditReadAllowed } from "./audit/auditAccess.js"

describe("PC settings limits", () => {
    it("flags system, security and retention settings", () => {
        expect(adminOnlySettingsIn({ maintenanceMode: true, orgName: "X" })).toEqual(["maintenanceMode"])
        expect(adminOnlySettingsIn({ requireAdminLoginCode: false, auditRetentionDays: 30 })).toEqual(["requireAdminLoginCode", "auditRetentionDays"])
    })
    it("lets business settings through", () => {
        expect(adminOnlySettingsIn({ orgName: "X", defaultTatHours: 24, androidAppUrl: null })).toEqual([])
        expect(adminOnlySettingsIn(undefined)).toEqual([])
    })
})

describe("PC user limits", () => {
    it("flags role, email and active changes", () => {
        expect(adminOnlyUserFieldsIn({ role: "ADMIN" })).toEqual(["role"])
        expect(adminOnlyUserFieldsIn({ isActive: false, email: "a@b.c", departmentId: "d" })).toEqual(["isActive", "email"])
    })
    it("lets department, store and phone changes through", () => {
        expect(adminOnlyUserFieldsIn({ departmentId: "d", storeId: "s", phone: "123" })).toEqual([])
    })
})

describe("audit log read", () => {
    it("gives admin everything and PC only a single record", () => {
        expect(auditReadAllowed("ADMIN", {})).toBe(true)
        expect(auditReadAllowed("PC", {})).toBe(false)
        expect(auditReadAllowed("PC", { entityId: "t1" })).toBe(true)
        expect(auditReadAllowed("PC", { entityId: "" })).toBe(false)
        expect(auditReadAllowed("MANAGER", { entityId: "t1" })).toBe(false)
    })
})
