import { createHash } from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { bumpVersions, cacheKey, cached, versionTag } from "../../config/queryCache.js"

const SCORES_VERSION = "scores"
const SCORE_TTL_SECONDS = 20

const BUMP_EVERY_MS = 2_000

export const createBumpCoalescer = (run: () => Promise<void>, everyMs: number, now: () => number = Date.now) => {
    let lastRunAt = Number.NEGATIVE_INFINITY
    let timer: ReturnType<typeof setTimeout> | null = null
    return (): Promise<void> => {
        const wait = lastRunAt + everyMs - now()
        if (wait <= 0) {
            lastRunAt = now()
            return run()
        }
        if (!timer) {
            timer = setTimeout(() => {
                timer = null
                lastRunAt = now()
                void run()
            }, wait)
            timer.unref()
        }
        return Promise.resolve()
    }
}

export const dropScoreCache = createBumpCoalescer(() => bumpVersions(SCORES_VERSION), BUMP_EVERY_MS)

export const cachedScores = async <T>(name: string, req: Request, compute: () => Promise<T>): Promise<T> => {
    const user = req.user!
    const version = await versionTag(SCORES_VERSION)
    const query = Object.keys(req.query).sort().map((key) => `${key}=${JSON.stringify(req.query[key])}`).join("&")
    const digest = createHash("sha1").update(query).digest("hex").slice(0, 16)
    return cached(cacheKey("scores", name, `v${version}`, user.sub, user.role, user.departmentId, user.storeId, digest), SCORE_TTL_SECONDS, compute)
}

export const dropScoresOnWrite = (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
        res.on("finish", () => {
            if (res.statusCode < 400) void dropScoreCache()
        })
    }
    next()
}
