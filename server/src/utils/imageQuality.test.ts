import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { assessImageQuality, failingFlagsOf, measureQuality, serializeQualityFlags } from "./imageQuality.js"

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

const lcg = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
}

const textPage = async (opts: { marginX: number; marginY: number }): Promise<Buffer> => {
    const next = lcg(7)
    const bars: string[] = []
    const stopY = opts.marginY === 0 ? HEIGHT + 40 : HEIGHT - opts.marginY
    const stopX = opts.marginX === 0 ? WIDTH + 80 : WIDTH - opts.marginX
    for (let y = opts.marginY; y < stopY; y += 22) {
        let x = opts.marginX
        while (x < stopX) {
            const wordWidth = 14 + Math.floor(next() * 46)
            for (let g = 0; g < wordWidth; g += 6) bars.push(`<rect x="${x + g}" y="${y}" width="${2 + Math.floor(next() * 3)}" height="12" fill="#111"/>`)
            x += wordWidth + 10
        }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="#f4f1ea"/>${bars.join("")}</svg>`
    return sharp(Buffer.from(svg)).png().toBuffer()
}

const blurred = (image: Buffer, sigma: number) => sharp(image).blur(sigma).png().toBuffer()

describe("text photos", () => {
    it("passes a sharp page with clear margins", async () => {
        const quality = await assessImageQuality(await textPage({ marginX: 60, marginY: 50 }))
        expect(quality?.flags).toEqual([])
        expect(quality?.textLike).toBe(true)
    })

    it("flags text that is soft but not blurry overall", async () => {
        const quality = await assessImageQuality(await blurred(await textPage({ marginX: 60, marginY: 50 }), 2))
        expect(quality?.flags).toEqual(["TEXT_UNREADABLE"])
    })

    it("calls a heavily blurred page blurry", async () => {
        const quality = await assessImageQuality(await blurred(await textPage({ marginX: 60, marginY: 50 }), 4))
        expect(quality?.flags).toEqual(["BLURRY"])
    })

    it("flags text that runs off every edge", async () => {
        const quality = await assessImageQuality(await textPage({ marginX: 0, marginY: 0 }))
        expect(quality?.flags).toEqual(["CROPPED"])
    })

    it("flags text cut off on the left and right only", async () => {
        const quality = await assessImageQuality(await textPage({ marginX: 0, marginY: 90 }))
        expect(quality?.flags).toEqual(["CROPPED"])
    })

    it("does not treat a busy sharp scene as text", async () => {
        const next = lcg(3)
        const raw = Buffer.alloc(WIDTH * HEIGHT)
        for (let i = 0; i < raw.length; i++) raw[i] = 60 + Math.floor(next() * 140)
        const quality = await assessImageQuality(await png(raw))
        expect(quality?.flags).toEqual([])
    })
})

describe("failingFlagsOf", () => {
    it("keeps only the flags that fail a photo", () => {
        expect(failingFlagsOf("DARK,BLURRY,CROPPED")).toEqual(["BLURRY", "CROPPED"])
        expect(failingFlagsOf("DARK,BRIGHT")).toEqual([])
        expect(failingFlagsOf(null)).toEqual([])
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
