import sharp from "sharp"
import { withImageSlot } from "./imageWork.js"

export type ImageQualityFlag = "BLURRY" | "DARK" | "BRIGHT" | "TEXT_UNREADABLE" | "CROPPED"

export const FAILING_FLAGS: readonly ImageQualityFlag[] = ["BLURRY", "TEXT_UNREADABLE", "CROPPED"]

export type ImageQuality = {
    flags: ImageQualityFlag[]
    sharpness: number
    brightness: number
    contrast: number
    textSharpness?: number
    textLike?: boolean
}

const ANALYSIS_EDGE = 640

export const DARK_BELOW = 40
export const BRIGHT_ABOVE = 225
export const BLUR_BELOW = 20
export const MIN_CONTRAST_FOR_BLUR = 14

const GRID = 8
const STRUCTURED_TILE_CONTRAST = 20
const MIN_STRUCTURED_SHARE = 0.08
const TEXT_SHARP_BELOW = 300
const BACKGROUND_BAND = 12
const MIN_BACKGROUND_SHARE = 0.45
const INK_SHARE_RANGE: readonly [number, number] = [0.02, 0.4]
const EDGE_BAND_SHARE = 0.03
const EDGE_INK_AT_LEAST = 0.1
const INK_BELOW_BACKGROUND = 30

const laplacianAt = (pixels: Uint8Array, width: number, i: number): number =>
    4 * pixels[i]! - pixels[i - 1]! - pixels[i + 1]! - pixels[i - width]! - pixels[i + width]!

const median = (values: number[]): number => {
    if (!values.length) return 0
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]!
}

const tileStats = (pixels: Uint8Array, width: number, height: number) => {
    const tileW = Math.floor(width / GRID)
    const tileH = Math.floor(height / GRID)
    const tiles: { contrast: number; sharp: number }[] = []
    if (tileW < 4 || tileH < 4) return tiles
    for (let ty = 0; ty < GRID; ty++) {
        for (let tx = 0; tx < GRID; tx++) {
            let sum = 0
            let n = 0
            for (let y = ty * tileH; y < (ty + 1) * tileH; y++) {
                for (let x = tx * tileW; x < (tx + 1) * tileW; x++) {
                    sum += pixels[y * width + x]!
                    n++
                }
            }
            const mean = sum / n
            let spread = 0
            let lapSum = 0
            let lapSquares = 0
            let lapCount = 0
            for (let y = ty * tileH; y < (ty + 1) * tileH; y++) {
                for (let x = tx * tileW; x < (tx + 1) * tileW; x++) {
                    const d = pixels[y * width + x]! - mean
                    spread += d * d
                    if (y > 0 && y < height - 1 && x > 0 && x < width - 1) {
                        const lap = laplacianAt(pixels, width, y * width + x)
                        lapSum += lap
                        lapSquares += lap * lap
                        lapCount++
                    }
                }
            }
            const lapMean = lapCount ? lapSum / lapCount : 0
            tiles.push({
                contrast: Math.sqrt(spread / n),
                sharp: lapCount ? lapSquares / lapCount - lapMean * lapMean : 0,
            })
        }
    }
    return tiles
}

const backgroundLevel = (pixels: Uint8Array, count: number) => {
    const histogram = new Uint32Array(256)
    for (let i = 0; i < count; i++) histogram[pixels[i]!]!++
    let modeBin = 0
    for (let b = 1; b < 256; b++) if (histogram[b]! > histogram[modeBin]!) modeBin = b
    let near = 0
    for (let b = Math.max(0, modeBin - BACKGROUND_BAND); b <= Math.min(255, modeBin + BACKGROUND_BAND); b++) near += histogram[b]!
    return { level: modeBin, share: near / count }
}

const bandInk = (pixels: Uint8Array, width: number, height: number, background: number) => {
    const band = Math.max(6, Math.round(Math.min(width, height) * EDGE_BAND_SHARE))
    const isInk = (x: number, y: number) => Math.abs(pixels[y * width + x]! - background) > INK_BELOW_BACKGROUND
    const share = (xFrom: number, xTo: number, yFrom: number, yTo: number) => {
        let ink = 0
        let total = 0
        for (let y = yFrom; y < yTo; y++) {
            for (let x = xFrom; x < xTo; x++) {
                total++
                if (isInk(x, y)) ink++
            }
        }
        return total ? ink / total : 0
    }
    return {
        left: share(0, band, 0, height),
        right: share(width - band, width, 0, height),
        top: share(0, width, 0, band),
        bottom: share(0, width, height - band, height),
        overall: share(0, width, 0, height),
    }
}

export const measureQuality = (pixels: Uint8Array, width: number, height: number): ImageQuality => {
    const count = width * height
    if (width < 3 || height < 3 || pixels.length < count) return { flags: [], sharpness: 0, brightness: 0, contrast: 0 }

    let sum = 0
    for (let i = 0; i < count; i++) sum += pixels[i]!
    const brightness = sum / count

    let spread = 0
    for (let i = 0; i < count; i++) {
        const d = pixels[i]! - brightness
        spread += d * d
    }
    const contrast = Math.sqrt(spread / count)

    let lapSum = 0
    let lapSquares = 0
    let samples = 0
    for (let y = 1; y < height - 1; y++) {
        const row = y * width
        for (let x = 1; x < width - 1; x++) {
            const lap = laplacianAt(pixels, width, row + x)
            lapSum += lap
            lapSquares += lap * lap
            samples++
        }
    }
    const lapMean = lapSum / samples
    const sharpness = lapSquares / samples - lapMean * lapMean

    const flags: ImageQualityFlag[] = []
    let textSharpness: number | undefined
    let textLike = false

    if (brightness < DARK_BELOW) flags.push("DARK")
    else if (brightness > BRIGHT_ABOVE) flags.push("BRIGHT")
    else if (sharpness < BLUR_BELOW && contrast >= MIN_CONTRAST_FOR_BLUR) flags.push("BLURRY")
    else {
        const tiles = tileStats(pixels, width, height)
        const structured = tiles.filter((t) => t.contrast >= STRUCTURED_TILE_CONTRAST)
        const background = backgroundLevel(pixels, count)
        const inkShare = bandInk(pixels, width, height, background.level)
        textLike = tiles.length > 0
            && structured.length / tiles.length >= MIN_STRUCTURED_SHARE
            && background.share >= MIN_BACKGROUND_SHARE
            && inkShare.overall >= INK_SHARE_RANGE[0]
            && inkShare.overall <= INK_SHARE_RANGE[1]
        if (textLike) {
            textSharpness = median(structured.map((t) => t.sharp))
            if (textSharpness < TEXT_SHARP_BELOW) flags.push("TEXT_UNREADABLE")
            const cutSideways = inkShare.left >= EDGE_INK_AT_LEAST && inkShare.right >= EDGE_INK_AT_LEAST
            const cutVertically = inkShare.top >= EDGE_INK_AT_LEAST && inkShare.bottom >= EDGE_INK_AT_LEAST
            if (cutSideways || cutVertically) flags.push("CROPPED")
        }
    }

    return {
        flags,
        sharpness: Math.round(sharpness * 10) / 10,
        brightness: Math.round(brightness * 10) / 10,
        contrast: Math.round(contrast * 10) / 10,
        ...(textSharpness !== undefined ? { textSharpness: Math.round(textSharpness) } : {}),
        textLike,
    }
}

export const assessImageQuality = async (input: string | Buffer): Promise<ImageQuality | null> => {
    try {
        const { data, info } = await withImageSlot(() => sharp(input, { failOn: "none" })
            .rotate()
            .resize({ width: ANALYSIS_EDGE, height: ANALYSIS_EDGE, fit: "inside", withoutEnlargement: true })
            .greyscale()
            .raw()
            .toBuffer({ resolveWithObject: true }))
        return measureQuality(data, info.width, info.height)
    } catch {
        return null
    }
}

export const serializeQualityFlags = (quality: ImageQuality | null): string | null =>
    quality && quality.flags.length > 0 ? quality.flags.join(",") : null

export const failingFlagsOf = (qualityFlags: string | null | undefined): ImageQualityFlag[] =>
    (qualityFlags ?? "")
        .split(",")
        .filter((flag): flag is ImageQualityFlag => (FAILING_FLAGS as readonly string[]).includes(flag))
