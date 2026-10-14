import { createHash } from "node:crypto"
import type { Request } from "express"
import { cached, cacheKey } from "../config/queryCache.js"

// Reports and trend views read months of runs and answers, and the same reviewers reload them over
// and over (a refresh, a filter toggled back, the dashboard opened twice). A short cache absorbs
// that. Staleness is bounded by the TTL and is fine for an aggregate; nothing that a person acts on
// the instant they change it (queues, lists, a single run) goes through here.
export const REPORT_TTL_SECONDS = 30

/**
 * Caches one report response for REPORT_TTL_SECONDS. The key carries the caller (id, role,
 * department, store: scope is resolved per person) and every query parameter, so two requests share
 * an entry only when they would have computed exactly the same thing. A Redis outage just runs
 * `compute` as if there were no cache (queryCache.ts's own rule).
 */
export const cachedReport = <T>(name: string, req: Request, compute: () => Promise<T>): Promise<T> => {
    const user = req.user!
    const query = Object.keys(req.query).sort().map((k) => `${k}=${JSON.stringify(req.query[k])}`).join("&")
    const digest = createHash("sha1").update(query).digest("hex").slice(0, 16)
    return cached(cacheKey("report", name, user.sub, user.role, user.departmentId, user.storeId, digest), REPORT_TTL_SECONDS, compute)
}
