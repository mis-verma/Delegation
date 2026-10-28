import sharp from "sharp"

export type ImageQualityFlag = "BLURRY" | "DARK" | "BRIGHT"

export type ImageQuality = {
    flags: ImageQualityFlag[]
    sharpness: number
    brightness: number
    contrast: number
}

const ANALYSIS_EDGE = 640

export const DARK_BELOW = 40
export const BRIGHT_ABOVE = 225
export const BLUR_BELOW = 20
export const MIN_CONTRAST_FOR_BLUR = 14

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
            const i = row + x
            const lap = 4 * pixels[i]! - pixels[i - 1]! - pixels[i + 1]! - pixels[i - width]! - pixels[i + width]!
            lapSum += lap
            lapSquares += lap * lap
            samples++
        }
    }
    const lapMean = lapSum / samples
    const sharpness = lapSquares / samples - lapMean * lapMean

    const flags: ImageQualityFlag[] = []
    if (brightness < DARK_BELOW) flags.push("DARK")
    else if (brightness > BRIGHT_ABOVE) flags.push("BRIGHT")
    else if (sharpness < BLUR_BELOW && contrast >= MIN_CONTRAST_FOR_BLUR) flags.push("BLURRY")

    return {
        flags,
        sharpness: Math.round(sharpness * 10) / 10,
        brightness: Math.round(brightness * 10) / 10,
        contrast: Math.round(contrast * 10) / 10,
    }
}

export const assessImageQuality = async (input: string | Buffer): Promise<ImageQuality | null> => {
    try {
        const { data, info } = await sharp(input, { failOn: "none" })
            .rotate()
            .resize({ width: ANALYSIS_EDGE, height: ANALYSIS_EDGE, fit: "inside", withoutEnlargement: true })
            .greyscale()
            .raw()
            .toBuffer({ resolveWithObject: true })
        return measureQuality(data, info.width, info.height)
    } catch {
        return null
    }
}

export const serializeQualityFlags = (quality: ImageQuality | null): string | null =>
    quality && quality.flags.length > 0 ? quality.flags.join(",") : null
