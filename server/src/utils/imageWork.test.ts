import { describe, expect, it } from "vitest"
import { MAX_PARALLEL_IMAGE_JOBS, withImageSlot } from "./imageWork.js"

describe("withImageSlot", () => {
    it("never runs more than the limit at once and finishes every job", async () => {
        let running = 0
        let peak = 0
        const job = async (n: number) => {
            running += 1
            peak = Math.max(peak, running)
            await new Promise((resolve) => setTimeout(resolve, 5))
            running -= 1
            return n
        }
        const results = await Promise.all(Array.from({ length: 12 }, (_, i) => withImageSlot(() => job(i))))
        expect(results).toEqual(Array.from({ length: 12 }, (_, i) => i))
        expect(peak).toBeLessThanOrEqual(MAX_PARALLEL_IMAGE_JOBS)
        expect(peak).toBeGreaterThan(0)
    })

    it("frees the slot when a job fails", async () => {
        await expect(withImageSlot(async () => { throw new Error("boom") })).rejects.toThrow("boom")
        await expect(withImageSlot(async () => "ok")).resolves.toBe("ok")
    })
})
