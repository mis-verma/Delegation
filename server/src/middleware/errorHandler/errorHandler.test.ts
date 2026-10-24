import { describe, expect, it, vi } from "vitest"
import type { NextFunction, Request, Response } from "express"
import { errorHandler } from "./errorHandler.js"

const run = (err: unknown) => {
    const json = vi.fn()
    const status = vi.fn((_code: number) => ({ json }))
    const res = { headersSent: false, locals: {}, status } as unknown as Response
    errorHandler(err, { method: "POST", originalUrl: "/x", url: "/x" } as Request, res, (() => undefined) as NextFunction)
    return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] as { success: boolean; message: string } }
}

describe("errorHandler", () => {
    it("answers an oversized body with 413", () => {
        const { status, body } = run(Object.assign(new Error("too big"), { status: 413, type: "entity.too.large" }))
        expect(status).toBe(413)
        expect(body.success).toBe(false)
    })

    it("answers malformed JSON with 400", () => {
        const { status, body } = run(Object.assign(new SyntaxError("bad"), { status: 400, type: "entity.parse.failed" }))
        expect(status).toBe(400)
        expect(body.message).toContain("JSON")
    })

    it("answers a blocked origin with 403", () => {
        expect(run(new Error("Not allowed by CORS")).status).toBe(403)
    })

    it("keeps unknown failures as 500", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        expect(run(new Error("boom")).status).toBe(500)
    })
})
