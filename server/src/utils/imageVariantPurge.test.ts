import { afterAll, beforeAll, describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { purgeStaleVariants } from "./imageVariants.js"

const folder = path.resolve("uploads", ".variants", "9999")
const DAY_S = 86_400

beforeAll(async () => {
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(path.join(folder, "old.jpg"), "old")
    await fs.writeFile(path.join(folder, "fresh.jpg"), "fresh")
    const longAgo = new Date(Date.now() - 40 * DAY_S * 1000)
    await fs.utimes(path.join(folder, "old.jpg"), longAgo, longAgo)
})

afterAll(async () => {
    await fs.rm(folder, { recursive: true, force: true })
})

describe("purgeStaleVariants", () => {
    it("removes thumbnails nobody asked for in a month and keeps recent ones", async () => {
        const removed = await purgeStaleVariants(30)
        expect(removed).toBeGreaterThanOrEqual(1)
        const left = await fs.readdir(folder)
        expect(left).toEqual(["fresh.jpg"])
    })
})
