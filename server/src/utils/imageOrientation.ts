import fs from "node:fs/promises"
import sharp from "sharp"
import { withImageSlot } from "./imageWork.js"

/**
 * Bakes a photo's EXIF orientation into its pixels.
 *
 * A phone records which way it was held as a tag rather than by rotating what it captured, so
 * the same file is upright in one viewer and on its side in the next. Every reader here already
 * calls sharp's rotate, which honours that tag, but the stored original did not, so anything
 * reading the file plainly, an export or another program, saw it sideways.
 *
 * Rotating once on the way in means the file itself is upright and the tag is gone, so there is
 * nothing left to interpret. Files that are already upright are left untouched.
 */

/** 1 is upright. Anything higher is a rotation, a mirror, or both. */
const UPRIGHT = 1

export const needsUpright = (orientation: number | undefined): boolean =>
    typeof orientation === "number" && orientation > UPRIGHT

/**
 * Returns true when the file was rewritten. Never throws: a photo that cannot be read here is
 * left exactly as it arrived, because losing the upload matters more than its orientation.
 */
export const uprightInPlace = async (filePath: string): Promise<boolean> => {
    try {
        const { orientation } = await sharp(filePath).metadata()
        if (!needsUpright(orientation)) return false

        const temp = `${filePath}.${process.pid}.upright`
        await withImageSlot(() => sharp(filePath).rotate().withMetadata({ orientation: undefined }).toFile(temp))
        await fs.rename(temp, filePath)
        return true
    } catch (err) {
        console.error(`Could not set ${filePath} upright, keeping it as uploaded:`, err)
        return false
    }
}

/** Sets a batch upright, one slot at a time, and says how many were actually rewritten. */
export const uprightAll = async (filePaths: readonly string[]): Promise<number> => {
    let rewritten = 0
    for (const filePath of filePaths) {
        if (await uprightInPlace(filePath)) rewritten += 1
    }
    return rewritten
}
