import { describe, expect, it } from "vitest"
import { forEachLimit } from "./forEachLimit.js"

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe("forEachLimit", () => {
    it("handles every item and never runs more than the limit at once", async () => {
        let running = 0
        let peak = 0
        const seen: number[] = []
        await forEachLimit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (n) => {
            running += 1
            peak = Math.max(peak, running)
            await pause(5)
            seen.push(n)
            running -= 1
        })
        expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        expect(peak).toBe(3)
    })

    it("does nothing for an empty list", async () => {
        let calls = 0
        await forEachLimit([], 5, async () => { calls += 1 })
        expect(calls).toBe(0)
    })

    it("stops starting new items after a failure and rethrows the first error", async () => {
        const started: number[] = []
        await expect(
            forEachLimit([1, 2, 3, 4, 5, 6], 1, async (n) => {
                started.push(n)
                if (n === 2) throw new Error("boom")
            }),
        ).rejects.toThrow("boom")
        expect(started).toEqual([1, 2])
    })
})
