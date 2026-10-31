import { describe, expect, it } from "vitest"
import type { Options, Store } from "express-rate-limit"
import { resilientStore } from "./resilientStore.js"
import { deriveTatDueAt } from "../modules/tickets/ticketShared.js"
import { MAX_TAT_HOURS } from "../utils/tatLimits.js"
import { backdateLimitFor } from "../modules/leave/leaveRules.js"

const broken: Store = {
    increment: () => Promise.reject(new Error("redis down")),
    decrement: () => Promise.reject(new Error("redis down")),
    resetKey: () => Promise.reject(new Error("redis down")),
}

const working = (): Store => {
    const hits = new Map<string, number>()
    return {
        increment: async (key) => {
            const next = (hits.get(key) ?? 0) + 1
            hits.set(key, next)
            return { totalHits: next, resetTime: new Date(Date.now() + 1000) }
        },
        decrement: async () => {},
        resetKey: async () => {},
    }
}

describe("resilientStore", () => {
    it("keeps counting in memory when the shared store fails", async () => {
        const store = resilientStore(broken)
        await store.init?.({ windowMs: 60_000 } as Options)
        expect((await store.increment("ip:1")).totalHits).toBe(1)
        expect((await store.increment("ip:1")).totalHits).toBe(2)
        expect((await store.increment("ip:2")).totalHits).toBe(1)
    })

    it("uses the shared store while it works", async () => {
        const store = resilientStore(working())
        await store.init?.({ windowMs: 60_000 } as Options)
        expect((await store.increment("ip:1")).totalHits).toBe(1)
        expect((await store.increment("ip:1")).totalHits).toBe(2)
    })
})

describe("deriveTatDueAt", () => {
    it("never goes past the 90 day cap", () => {
        const from = new Date("2026-01-01T00:00:00.000Z")
        const due = deriveTatDueAt(1e9, from)!
        expect(due.getTime() - from.getTime()).toBe(MAX_TAT_HOURS * 3_600_000)
        expect(deriveTatDueAt(null, from)).toBeNull()
    })
})

describe("backdateLimitFor", () => {
    it("gives admin and PC 14 days and heads 1 day", () => {
        expect(backdateLimitFor("ADMIN")).toBe(14)
        expect(backdateLimitFor("PC")).toBe(14)
        expect(backdateLimitFor("MANAGER")).toBe(1)
        expect(backdateLimitFor("SENIOR")).toBe(1)
    })
})
