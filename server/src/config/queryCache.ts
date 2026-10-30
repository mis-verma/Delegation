import { createClient, type RedisClientType } from "redis"
import { env } from "./env.js"

let client: RedisClientType | null = null
let connecting: Promise<void> | null = null
let disabledUntil = 0
const DISABLE_MS = 30_000

const CONNECT_WAIT_MS = 250
const WRITE_WAIT_MS = 1000
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("query cache connect timed out")), ms)
        promise.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (err) => { clearTimeout(timer); reject(err) },
        )
    })

const connect = async () => {
    if (!client) {
        const c = createClient({
            url: env.REDIS_URL,
            socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5000) },
            disableOfflineQueue: true,
        }) as RedisClientType
        c.on("error", (err) => console.error("Redis query-cache client error:", err.message))
        client = c
        connecting = c.connect().then(() => undefined, () => undefined)
    }
    if (client.isReady) return
    if (Date.now() < disabledUntil) throw new Error("query cache temporarily disabled")
    try {
        await withTimeout(connecting!, CONNECT_WAIT_MS)
    } catch {
        disabledUntil = Date.now() + DISABLE_MS
        throw new Error("query cache not connected yet")
    }
    if (!client.isReady) throw new Error("query cache reconnecting")
}

const inflight = new Map<string, Promise<unknown>>()

const lookupOrCompute = async <T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> => {
    try {
        await withTimeout(connect(), CONNECT_WAIT_MS)
        const hit = await withTimeout(client!.get(key), CONNECT_WAIT_MS)
        if (hit !== null) return JSON.parse(hit) as T
    } catch {
        return compute()
    }

    const value = await compute()
    const redis = client!
    withTimeout(redis.set(key, JSON.stringify(value), { EX: ttlSeconds }), WRITE_WAIT_MS).catch(() => {})
    return value
}

export const cached = <T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> => {
    const running = inflight.get(key) as Promise<T> | undefined
    if (running) return running
    const work = lookupOrCompute(key, ttlSeconds, compute).finally(() => { inflight.delete(key) })
    inflight.set(key, work)
    return work
}

export const invalidate = async (prefix: string) => {
    try {
        await connect()
        for await (const key of client!.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
            await client!.del(key)
        }
    } catch {
    }
}

const INVALIDATE_WAIT_MS = 400

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

const VERSION_PREFIX = "ver"
const VERSION_TTL_SECONDS = 24 * 60 * 60

export const versionTag = async (...namespaces: string[]): Promise<string> => {
    if (!namespaces.length) return ""
    try {
        await withTimeout(connect(), CONNECT_WAIT_MS)
        const values = await withTimeout(client!.mGet(namespaces.map((n) => cacheKey(VERSION_PREFIX, n))), CONNECT_WAIT_MS)
        return values.map((v) => v ?? "0").join(".")
    } catch {
        return "0"
    }
}

export const bumpVersions = async (...namespaces: string[]): Promise<void> => {
    if (!namespaces.length) return
    try {
        await withTimeout(connect(), INVALIDATE_WAIT_MS)
        const batch = client!.multi()
        for (const n of namespaces) {
            const key = cacheKey(VERSION_PREFIX, n)
            batch.incr(key).expire(key, VERSION_TTL_SECONDS)
        }
        await withTimeout(batch.exec(), INVALIDATE_WAIT_MS)
    } catch {
    }
}

export const invalidateKeys = async (...keys: string[]): Promise<void> => {
    if (!keys.length) return
    try {
        await withTimeout(connect(), INVALIDATE_WAIT_MS)
        await withTimeout(client!.del(keys), INVALIDATE_WAIT_MS)
    } catch {
    }
}

export const cacheKey = (...parts: (string | number | undefined)[]) =>
    parts.filter((p) => p !== undefined && p !== "").join(":")

export const warmQueryCache = () => { connect().catch(() => {}) }

export const disconnectQueryCache = async () => {
    if (client?.isOpen) await client.disconnect().catch((err) => console.error("Failed to close the query-cache Redis client:", err))
}

export const queryCacheStatus = (): 'ok' | 'unavailable' => (client?.isReady ? 'ok' : 'unavailable')
