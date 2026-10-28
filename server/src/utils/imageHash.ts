import sharp from "sharp"
import { withImageSlot } from "./imageWork.js"

const HASH_WIDTH = 9
const HASH_HEIGHT = 8

export const hammingHex = (a: string, b: string): number => {
    let bits = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
    let count = 0
    while (bits > 0n) {
        count += Number(bits & 1n)
        bits >>= 1n
    }
    return count
}

export const perceptualHash = async (file: string): Promise<string | null> => {
    try {
        const pixels = await withImageSlot(() => sharp(file, { failOn: "none" })
            .rotate()
            .resize(HASH_WIDTH, HASH_HEIGHT, { fit: "fill" })
            .greyscale()
            .raw()
            .toBuffer())
        let bits = 0n
        let set = 0
        for (let y = 0; y < HASH_HEIGHT; y++) {
            for (let x = 0; x < HASH_WIDTH - 1; x++) {
                const bit = pixels[y * HASH_WIDTH + x]! > pixels[y * HASH_WIDTH + x + 1]! ? 1n : 0n
                bits = (bits << 1n) | bit
                if (bit === 1n) set++
            }
        }
        if (set === 0) return null
        return bits.toString(16).padStart(16, "0")
    } catch {
        return null
    }
}
