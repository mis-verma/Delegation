import { createHash } from "node:crypto"
import type { Request } from "express"
import { cached, cacheKey } from "../config/queryCache.js"

export const REPORT_TTL_SECONDS = 30

export const cachedReport = <T>(name: string, req: Request, compute: () => Promise<T>): Promise<T> => {
    const user = req.user!
    const query = Object.keys(req.query).sort().map((k) => `${k}=${JSON.stringify(req.query[k])}`).join("&")
    const digest = createHash("sha1").update(query).digest("hex").slice(0, 16)
    return cached(cacheKey("report", name, user.sub, user.role, user.departmentId, user.storeId, digest), REPORT_TTL_SECONDS, compute)
}
