import { describe, expect, it } from "vitest"
import { captureRequestSource, currentRequestSource, sourceFromHeader } from "./requestSource.js"
import type { Request, Response } from "express"

describe("sourceFromHeader", () => {
    it("knows the mcp client in any letter case", () => {
        expect(sourceFromHeader("mcp")).toBe("MCP")
        expect(sourceFromHeader(" MCP ")).toBe("MCP")
    })
    it("ignores anything else", () => {
        expect(sourceFromHeader("whatsapp")).toBeNull()
        expect(sourceFromHeader(undefined)).toBeNull()
        expect(sourceFromHeader(["mcp"])).toBe("MCP")
    })
})

describe("captureRequestSource", () => {
    const run = (header: string | undefined) => {
        let seen: string | null = "unset"
        captureRequestSource({ headers: header ? { "x-client-source": header } : {} } as unknown as Request, {} as Response, () => { seen = currentRequestSource() })
        return seen
    }
    it("makes the source visible to code running in the same request", () => {
        expect(run("mcp")).toBe("MCP")
    })
    it("leaves other requests untouched", () => {
        expect(run(undefined)).toBeNull()
        expect(currentRequestSource()).toBeNull()
    })
})
