import { describe, expect, it, vi } from "vitest"

vi.mock("./env.js", () => ({ env: { REDIS_URL: "redis://127.0.0.1:1" } }))
vi.mock("redis", () => ({
    createClient: () => ({ on: () => undefined, connect: () => Promise.reject(new Error("down")), isReady: false, isOpen: false }),
}))

import { cached } from "./queryCache.js"

describe("cached", () => {
    it("computes once for many callers asking for the same key at the same time", async () => {
        let calls = 0
        const compute = async () => {
            calls += 1
            await new Promise((resolve) => setTimeout(resolve, 20))
            return { ok: true }
        }
        const results = await Promise.all(Array.from({ length: 10 }, () => cached("same", 5, compute)))
        expect(calls).toBe(1)
        expect(results.every((r) => r.ok)).toBe(true)
    })

    it("computes again after the first run finished, and keeps keys apart", async () => {
        let calls = 0
        const compute = async () => {
            calls += 1
            return calls
        }
        await cached("a", 5, compute)
        await cached("a", 5, compute)
        await cached("b", 5, compute)
        expect(calls).toBe(3)
    })

    it("lets every waiting caller see a failure, then recovers", async () => {
        const failing = () => Promise.reject(new Error("boom"))
        const settled = await Promise.allSettled([cached("f", 5, failing), cached("f", 5, failing)])
        expect(settled.every((s) => s.status === "rejected")).toBe(true)
        expect(await cached("f", 5, async () => "fine")).toBe("fine")
    })
})
