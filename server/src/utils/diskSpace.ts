import fs from "node:fs"
import { AppError } from "./AppError.js"

export const MIN_FREE_BYTES = 1024 * 1024 * 1024
const CHECK_EVERY_MS = 10_000

let lastCheckAt = 0
let lastFreeBytes = Number.POSITIVE_INFINITY

export const hasRoomForUploads = (freeBytes: number, minFreeBytes = MIN_FREE_BYTES) => freeBytes >= minFreeBytes

const freeBytesAt = (dir: string, cb: (free: number) => void) => {
    const now = Date.now()
    if (now - lastCheckAt < CHECK_EVERY_MS) return cb(lastFreeBytes)
    fs.statfs(dir, (err, stats) => {
        if (!err) {
            lastCheckAt = now
            lastFreeBytes = Number(stats.bavail) * Number(stats.bsize)
        }
        cb(err ? Number.POSITIVE_INFINITY : lastFreeBytes)
    })
}

export const uploadDestination = (dir: string) => (_req: unknown, _file: unknown, cb: (error: Error | null, destination: string) => void) => {
    freeBytesAt(dir, (free) => {
        if (hasRoomForUploads(free)) return cb(null, dir)
        console.error(`Uploads refused: only ${Math.round(free / 1024 / 1024)} MB free on the upload disk`)
        cb(new AppError("The server is almost out of space, so uploads are paused. Tell your admin.", 507), dir)
    })
}
