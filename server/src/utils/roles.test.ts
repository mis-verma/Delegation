import { describe, expect, it, vi } from "vitest"
import type { NextFunction, Request, Response } from "express"
import { isAdminOrPc, isDepartmentHeadRole, isOwnScopeRole } from "./roles.js"
import { requireRole } from "../middleware/auth/auth.js"
import { AppError } from "./AppError.js"

describe("role helpers", () => {
    it("recognises organisation-wide roles", () => {
        expect(isAdminOrPc("ADMIN")).toBe(true)
        expect(isAdminOrPc("PC")).toBe(true)
        for (const role of ["OWNER", "APPROVAL_MANAGER", "MANAGER", "SENIOR", "AGENT", "USER", undefined, null]) {
            expect(isAdminOrPc(role)).toBe(false)
        }
    })

    it("recognises department heads", () => {
        expect(isDepartmentHeadRole("MANAGER")).toBe(true)
        expect(isDepartmentHeadRole("SENIOR")).toBe(true)
        for (const role of ["ADMIN", "PC", "OWNER", "AGENT", "USER", undefined]) {
            expect(isDepartmentHeadRole(role)).toBe(false)
        }
    })

    it("recognises own-scope roles", () => {
        expect(isOwnScopeRole("AGENT")).toBe(true)
        expect(isOwnScopeRole("USER")).toBe(true)
        expect(isOwnScopeRole("MANAGER")).toBe(false)
    })
})

describe("requireRole", () => {
    const run = (roles: Parameters<typeof requireRole>, user: Request["user"]) => {
        const next = vi.fn() as unknown as NextFunction
        requireRole(...roles)({ user } as Request, {} as Response, next)
        return (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as AppError | undefined
    }

    it("lets a listed role through", () => {
        expect(run(["ADMIN", "PC"], { sub: "u", role: "PC" })).toBeUndefined()
    })

    it("blocks a role that is not listed", () => {
        expect(run(["ADMIN", "PC"], { sub: "u", role: "USER" })?.statusCode).toBe(403)
    })

    it("blocks a request with no user", () => {
        expect(run(["ADMIN"], undefined)?.statusCode).toBe(401)
    })
})
