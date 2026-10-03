import { createClient, type RedisClientType } from "redis"
import { env } from "./env.js"

/**
 * Short-TTL caching for expensive read queries.
 *
 * Redis was already a dependency here, but only for socket pub/sub and rate limiting — no query
 * result had ever been cached, so aggregate endpoints recomputed from scratch on every dashboard
 * load and lookup tables (stores, departments, categories) were re-queried on every page.
 *
 * Two rules this deliberately follows, both learned from `auditService.record`:
 *
 * 1. **A cache failure must never fail the request.** Every path here swallows Redis errors and
 *    falls through to the real query. A down cache makes the app slower, never broken.
 * 2. **Never cache something whose staleness is a correctness bug.** Permissions, anything
 *    scoped per-user by role, or a value the caller is about to write to — pick a TTL for how
 *    wrong the number is allowed to be, and prefer explicit invalidation for anything that has a
 *    clear "this just changed" moment.
 */

let client: RedisClientType | null = null
let connecting: Promise<void> | null = null
// After a failed connect, stop retrying on every request — otherwise a Redis outage turns every
// cached read into a connection attempt and the cache makes things slower than no cache at all.
let disabledUntil = 0
const DISABLE_MS = 30_000

// A cold connect (fresh TCP handshake + Redis handshake) has been observed taking multiple
// seconds in this environment — long enough that the very first request to hit a cached lookup
// (e.g. GET /stores right after a fresh login) was blocking on it, in full, before falling back
// to `compute()`. `disabledUntil` above only protects against a *failed* connect; a slow-but-
// eventually-successful one still stalled the request for its entire duration. Capping how long
// any single request will wait for the connection keeps rule 1 above ("a cache failure must never
// fail the request") honest for "slow" too, not just "down" — the in-flight `connecting` promise
// itself is left running in the background either way, so a request that arrives after this one
// still benefits once it resolves.
const CONNECT_WAIT_MS = 250
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("query cache connect timed out")), ms)
        promise.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (err) => { clearTimeout(timer); reject(err) },
        )
    })

const connect = async () => {
    if (client?.isReady) return
    if (Date.now() < disabledUntil) throw new Error("query cache temporarily disabled")
    if (!connecting) {
        connecting = (async () => {
            const c = createClient({
                url: env.REDIS_URL,
                socket: { reconnectStrategy: (retries) => (retries > 5 ? new Error("giving up") : Math.min(retries * 200, 2000)) },
            }) as RedisClientType
            c.on("error", (err) => console.error("Redis query-cache client error:", err.message))
            await c.connect()
            client = c
        })().catch((err) => {
            disabledUntil = Date.now() + DISABLE_MS
            connecting = null
            throw err
        })
    }
    await connecting
}

/**
 * Returns the cached value for `key`, or runs `compute()` and caches its result for `ttlSeconds`.
 *
 * `compute` runs exactly as it would without a cache when Redis is unavailable, so a caller never
 * has to handle a cache-specific failure mode.
 */
export const cached = async <T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> => {
    try {
        await withTimeout(connect(), CONNECT_WAIT_MS)
        const hit = await client!.get(key)
        if (hit !== null) return JSON.parse(hit) as T
    } catch {
        return compute()
    }

    const value = await compute()
    try {
        // Errors here are ignored on purpose: the value is already correct, it just won't be
        // cached. Failing the request because we couldn't *store* a result would be absurd.
        await client!.set(key, JSON.stringify(value), { EX: ttlSeconds })
    } catch {
        // Intentionally empty — see above.
    }
    return value
}

/**
 * Drops every key under `prefix`. Call after a mutation that makes cached reads wrong.
 *
 * Uses SCAN rather than KEYS — KEYS blocks the whole Redis server while it walks the keyspace,
 * which on a shared instance means blocking rate limiting and socket pub/sub too.
 */
export const invalidate = async (prefix: string) => {
    try {
        await connect()
        for await (const key of client!.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
            await client!.del(key)
        }
    } catch {
        // A failed invalidation means stale reads until the TTL expires, which is why every cached
        // entry has one. Still not worth failing the mutation that just succeeded.
    }
}

// How long a mutation will wait for cache invalidation before moving on. The client refetches the
// moment the response lands, so invalidating in the background could race it and hand back the old
// number; but a slow Redis must never stall a write, so the wait is capped (the TTL is the backstop).
const INVALIDATE_WAIT_MS = 400

/**
 * `invalidate` for several prefixes at once, awaited for at most INVALIDATE_WAIT_MS. Never throws.
 * Use from mutations that change a cached count, right before responding.
 */
export const invalidateQuick = async (...prefixes: string[]): Promise<void> => {
    if (!prefixes.length) return
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, INVALIDATE_WAIT_MS) })
    try {
        await Promise.race([Promise.all(prefixes.map((p) => invalidate(p))), timeout])
    } finally {
        clearTimeout(timer)
    }
}

/** Namespaced so `invalidate('lookup:stores')` can't accidentally match another module's keys. */
export const cacheKey = (...parts: (string | number | undefined)[]) =>
    parts.filter((p) => p !== undefined && p !== "").join(":")

// Fire-and-forget: called once from server.ts right after boot so the (slow) initial TCP+Redis
// handshake happens in the background before any request needs it, instead of on whichever
// request happens to be first through the door. Never awaited by the caller — `connect()`'s own
// `connecting` promise still does the real work, this just kicks it off early. Errors are exactly
// what `connect()` already handles (sets `disabledUntil`), so nothing more to do here.
export const warmQueryCache = () => { connect().catch(() => {}) }

// Called from server.ts's shutdown() alongside disconnectRedisClients (config/redis.ts) — this
// client is created lazily on first cache use and lives in module scope here, so it needs its own
// cleanup hook rather than being covered by that one.
export const disconnectQueryCache = async () => {
    if (client?.isOpen) await client.disconnect().catch((err) => console.error("Failed to close the query-cache Redis client:", err))
}

// For the readiness endpoint (app.ts's /health/ready) — reports the *current* state of the lazily-
// created client rather than forcing a fresh connect() attempt, so hitting /health/ready never
// itself opens a new Redis connection. "unavailable" covers "never used yet", "mid-reconnect", and
// "in its post-failure backoff window" alike — all three mean the same thing to an operator reading
// this (the cache isn't currently helping), and per this file's own rule 1 above, none of them are
// ever allowed to fail an actual request either way.
export const queryCacheStatus = (): 'ok' | 'unavailable' => (client?.isReady ? 'ok' : 'unavailable')
