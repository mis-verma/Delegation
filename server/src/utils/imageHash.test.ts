import { afterAll, beforeAll, describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { hammingHex, perceptualHash } from "./imageHash.js"

let dir: string

const stripes = (width: number, height: number, offset: number) => {
    const data = Buffer.alloc(width * height * 3)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const value = Math.floor(128 + 127 * Math.sin((x / width) * Math.PI * 6 + offset + (y / height) * 2))
            const i = (y * width + x) * 3
            data[i] = value
            data[i + 1] = value
            data[i + 2] = value
        }
    }
    return sharp(data, { raw: { width, height, channels: 3 } })
}

const checker = (width: number, height: number) => {
    const data = Buffer.alloc(width * height * 3)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const value = (Math.floor(x / (width / 4)) + Math.floor(y / (height / 4))) % 2 === 0 ? 230 : 25
            const i = (y * width + x) * 3
            data[i] = value
            data[i + 1] = value
            data[i + 2] = value
        }
    }
    return sharp(data, { raw: { width, height, channels: 3 } })
}

beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "hash-"))
    await stripes(1200, 800, 0).jpeg({ quality: 92 }).toFile(path.join(dir, "original.jpg"))
    await stripes(600, 400, 0).jpeg({ quality: 60 }).toFile(path.join(dir, "shrunk.jpg"))
    await checker(1200, 800).jpeg({ quality: 92 }).toFile(path.join(dir, "other.jpg"))
    await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 60, b: 30 } } }).jpeg().toFile(path.join(dir, "flat.jpg"))
    await fs.writeFile(path.join(dir, "broken.jpg"), "not an image")
})

afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true })
})

describe("perceptualHash", () => {
    it("gives the same hash for the same photo after resizing and recompressing", async () => {
        const a = await perceptualHash(path.join(dir, "original.jpg"))
        const b = await perceptualHash(path.join(dir, "shrunk.jpg"))
        expect(a).not.toBeNull()
        expect(a).toBe(b)
    })

    it("gives a different hash for a different photo", async () => {
        expect(await perceptualHash(path.join(dir, "original.jpg"))).not.toBe(await perceptualHash(path.join(dir, "other.jpg")))
    })

    it("returns 16 hex characters", async () => {
        expect(await perceptualHash(path.join(dir, "other.jpg"))).toMatch(/^[0-9a-f]{16}$/)
    })

    it("skips flat images and files that are not images", async () => {
        expect(await perceptualHash(path.join(dir, "flat.jpg"))).toBeNull()
        expect(await perceptualHash(path.join(dir, "broken.jpg"))).toBeNull()
        expect(await perceptualHash(path.join(dir, "missing.jpg"))).toBeNull()
    })
})

describe("hammingHex", () => {
    it("counts differing bits", () => {
        expect(hammingHex("0000000000000000", "0000000000000000")).toBe(0)
        expect(hammingHex("0000000000000001", "0000000000000000")).toBe(1)
        expect(hammingHex("ffffffffffffffff", "0000000000000000")).toBe(64)
        expect(hammingHex("f0f0f0f0a5a5a5a5", "f0f0f0f1a5a5a5a7")).toBe(2)
    })
})
