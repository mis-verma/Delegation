import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit"
import { COOL_DOWN_MS, TRIP_AFTER_FAILURES, resilientStore } from "./resilientStore.js"
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

type Behaviour = "ok" | "throw" | "hang"

const fakePrimary = () => {
    const state = { behaviour: "ok" as Behaviour, calls: 0, hits: 0 }
    const store: Store = {
        init: () => undefined,
        increment: (): Promise<ClientRateLimitInfo> => {
            state.calls += 1
            if (state.behaviour === "throw") return Promise.reject(new Error("redis is unhappy"))
            if (state.behaviour === "hang") return new Promise(() => undefined)
            state.hits += 1
            return Promise.resolve({ totalHits: state.hits, resetTime: undefined })
        },
        decrement: () => undefined,
        resetKey: () => undefined,
    }
    return { state, store }
}

describe("resilientStore breaker", () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    const build = () => {
        const primary = fakePrimary()
        const store = resilientStore(primary.store)
        void store.init?.({ windowMs: 60_000 } as Options)
        return { ...primary, store }
    }

    const incrementAll = async (store: Store, times: number) => {
        const results: ClientRateLimitInfo[] = []
        for (let i = 0; i < times; i++) {
            const pending = store.increment("ip:1.1.1.1")
            await vi.advanceTimersByTimeAsync(600)
            results.push(await pending)
        }
        return results
    }

    it("counts in the shared store while it is healthy", async () => {
        const { store, state } = build()
        const results = await incrementAll(store, 3)
        expect(results.map((r) => r.totalHits)).toEqual([1, 2, 3])
        expect(state.calls).toBe(3)
    })

    it("falls back to local counting when the shared store throws", async () => {
        const { store, state } = build()
        state.behaviour = "throw"
        const [first] = await incrementAll(store, 1)
        expect(first?.totalHits).toBe(1)
        expect(state.hits).toBe(0)
    })

    it("falls back when the shared store answers too slowly", async () => {
        const { store, state } = build()
        state.behaviour = "hang"
        const [first] = await incrementAll(store, 1)
        expect(first?.totalHits).toBe(1)
        expect(state.hits).toBe(0)
    })

    it("stops waiting on a sick store once it has failed enough times", async () => {
        const { store, state } = build()
        state.behaviour = "hang"
        await incrementAll(store, TRIP_AFTER_FAILURES)
        expect(state.calls).toBe(TRIP_AFTER_FAILURES)

        await incrementAll(store, 10)
        expect(state.calls).toBe(TRIP_AFTER_FAILURES)
    })

    it("lets a single request probe once the cool-down has passed", async () => {
        const { store, state } = build()
        state.behaviour = "hang"
        await incrementAll(store, TRIP_AFTER_FAILURES)
        await incrementAll(store, 1)
        expect(state.calls).toBe(TRIP_AFTER_FAILURES)

        await vi.advanceTimersByTimeAsync(COOL_DOWN_MS)
        state.behaviour = "ok"
        await incrementAll(store, 1)
        expect(state.calls).toBe(TRIP_AFTER_FAILURES + 1)
    })

    it("goes back to the shared store after a probe succeeds", async () => {
        const { store, state } = build()
        state.behaviour = "hang"
        await incrementAll(store, TRIP_AFTER_FAILURES)

        await vi.advanceTimersByTimeAsync(COOL_DOWN_MS)
        state.behaviour = "ok"
        await incrementAll(store, 3)
        expect(state.calls).toBe(TRIP_AFTER_FAILURES + 3)
    })

    it("stays shut for another cool-down when the probe also fails", async () => {
        const { store, state } = build()
        state.behaviour = "hang"
        await incrementAll(store, TRIP_AFTER_FAILURES)

        await vi.advanceTimersByTimeAsync(COOL_DOWN_MS)
        await incrementAll(store, 1)
        expect(state.calls).toBe(TRIP_AFTER_FAILURES + 1)

        await incrementAll(store, 5)
        expect(state.calls).toBe(TRIP_AFTER_FAILURES + 1)
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
