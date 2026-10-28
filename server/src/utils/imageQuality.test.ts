import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { assessImageQuality, measureQuality, serializeQualityFlags } from "./imageQuality.js"

const WIDTH = 640
const HEIGHT = 480

const blocks = (low: number, high: number, size = 40): Buffer => {
    const raw = Buffer.alloc(WIDTH * HEIGHT)
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            raw[y * WIDTH + x] = (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0 ? low : high
        }
    }
    return raw
}

const png = (raw: Buffer) => sharp(raw, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } }).png().toBuffer()

describe("assessImageQuality", () => {
    it("passes a crisp, well lit photo", async () => {
        const quality = await assessImageQuality(await png(blocks(70, 190)))
        expect(quality?.flags).toEqual([])
    })

    it("flags a blurry photo that still has content", async () => {
        const blurred = await sharp(await png(blocks(70, 190))).blur(9).png().toBuffer()
        const quality = await assessImageQuality(blurred)
        expect(quality?.flags).toEqual(["BLURRY"])
    })

    it("flags a dark photo", async () => {
        const quality = await assessImageQuality(await png(blocks(5, 40)))
        expect(quality?.flags).toEqual(["DARK"])
    })

    it("flags an over-exposed photo", async () => {
        const quality = await assessImageQuality(await png(blocks(225, 255)))
        expect(quality?.flags).toEqual(["BRIGHT"])
    })

    it("does not call a plain wall blurry", async () => {
        const quality = await assessImageQuality(await png(blocks(128, 130)))
        expect(quality?.flags).toEqual([])
    })

    it("returns null for a file it cannot read", async () => {
        expect(await assessImageQuality(Buffer.from("not an image"))).toBeNull()
    })
})

describe("measureQuality", () => {
    it("ignores tiny images", () => {
        expect(measureQuality(new Uint8Array(4), 2, 2).flags).toEqual([])
    })
})

describe("serializeQualityFlags", () => {
    it("joins flags and returns null when clean", () => {
        expect(serializeQualityFlags({ flags: ["BLURRY", "DARK"], sharpness: 0, brightness: 0, contrast: 0 })).toBe("BLURRY,DARK")
        expect(serializeQualityFlags({ flags: [], sharpness: 1, brightness: 1, contrast: 1 })).toBeNull()
        expect(serializeQualityFlags(null)).toBeNull()
    })
})
