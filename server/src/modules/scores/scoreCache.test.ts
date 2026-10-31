import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBumpCoalescer } from "./scoreCache.js"

describe("createBumpCoalescer", () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it("runs the first call at once", async () => {
        const run = vi.fn(() => Promise.resolve())
        const bump = createBumpCoalescer(run, 2000)
        await bump()
        expect(run).toHaveBeenCalledTimes(1)
    })

    it("turns a burst of calls into one trailing run", async () => {
        const run = vi.fn(() => Promise.resolve())
        const bump = createBumpCoalescer(run, 2000)
        await bump()
        for (let i = 0; i < 50; i++) await bump()
        expect(run).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(2000)
        expect(run).toHaveBeenCalledTimes(2)
        await vi.advanceTimersByTimeAsync(5000)
        expect(run).toHaveBeenCalledTimes(2)
    })

    it("runs again at once after a quiet period", async () => {
        const run = vi.fn(() => Promise.resolve())
        const bump = createBumpCoalescer(run, 2000)
        await bump()
        await vi.advanceTimersByTimeAsync(2500)
        await bump()
        expect(run).toHaveBeenCalledTimes(2)
    })
})
