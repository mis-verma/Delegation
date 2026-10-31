import fs from "node:fs"
import path from "node:path"
import type { NextFunction, Request, Response } from "express"
import { AppError } from "./AppError.js"

export const MIN_FREE_BYTES = 1024 * 1024 * 1024
const CHECK_EVERY_MS = 10_000
const UPLOADS_DIR = path.resolve("uploads")

let lastCheckAt = 0
let lastFreeBytes = Number.POSITIVE_INFINITY
let inflight: Promise<number> | null = null

export const hasRoomForUploads = (freeBytes: number, minFreeBytes = MIN_FREE_BYTES) => freeBytes >= minFreeBytes

const freeBytes = (): Promise<number> => {
    if (Date.now() - lastCheckAt < CHECK_EVERY_MS) return Promise.resolve(lastFreeBytes)
    inflight ??= fs.promises.statfs(UPLOADS_DIR)
        .then((stats) => {
            lastCheckAt = Date.now()
            lastFreeBytes = Number(stats.bavail) * Number(stats.bsize)
            return lastFreeBytes
        })
        .catch(() => Number.POSITIVE_INFINITY)
        .finally(() => { inflight = null })
    return inflight
}

export const requireDiskSpace = (req: Request, _res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || !req.is("multipart/form-data")) return next()
    freeBytes().then((free) => {
        if (hasRoomForUploads(free)) return next()
        console.error(`Uploads refused: only ${Math.round(free / 1024 / 1024)} MB free on the upload disk`)
        next(new AppError("The server is almost out of space, so uploads are paused. Tell your admin.", 507))
    })
}
