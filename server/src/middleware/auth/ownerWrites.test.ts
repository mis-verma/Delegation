import { describe, expect, it } from "vitest"
import type { Request } from "express"
import { ownerMayWrite } from "./auth.js"

const at = (baseUrl: string, path: string) => ({ baseUrl, path }) as Request

describe("ownerMayWrite", () => {
    it("lets the owner change their own password, profile picture and notifications", () => {
        expect(ownerMayWrite(at("/users", "/me/password"))).toBe(true)
        expect(ownerMayWrite(at("/users", "/me/avatar"))).toBe(true)
        expect(ownerMayWrite(at("/users", "/me"))).toBe(true)
        expect(ownerMayWrite(at("/notifications", "/read-all"))).toBe(true)
        expect(ownerMayWrite(at("/notifications", "/push/subscribe"))).toBe(true)
        expect(ownerMayWrite(at("/auth", "/logout"))).toBe(true)
    })

    it("blocks every other write", () => {
        expect(ownerMayWrite(at("/tasks", "/"))).toBe(false)
        expect(ownerMayWrite(at("/tickets", "/abc/close"))).toBe(false)
        expect(ownerMayWrite(at("/users", "/"))).toBe(false)
        expect(ownerMayWrite(at("/users", "/someone/reset-password"))).toBe(false)
        expect(ownerMayWrite(at("/users", "/me/../x"))).toBe(false)
        expect(ownerMayWrite(at("/settings", "/"))).toBe(false)
    })
})
