import { createClient, type RedisClientType } from "redis"
import { env } from "../../config/env.js"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/core.js"
import { eq } from "drizzle-orm"

/**
 * Tracks who's currently connected over the socket, per `sockets/socket.ts`'s existing
 * connection/disconnect handlers — a small Redis-backed presence set, separate from
 * config/queryCache.ts (that one's a TTL cache; this is live, mutated state) and from the rate
 * limiter's client, matching this codebase's existing "one client per concern" pattern.
 *
 * Same two rules as queryCache.ts, for the same reason: presence is a nice-to-have, never allowed
 * to affect whether a socket connects or an API request succeeds.
 * 1. A Redis failure here must never fail the caller — every path swallows errors.
 * 2. A stale entry (server crash mid-connection, no clean disconnect) is an acceptable, self-
 *    limited edge case, not something worth a heartbeat/TTL scheme to fully rule out.
 */

const ONLINE_SET_KEY = "presence:online"
const socketsKey = (userId: string) => `presence:sockets:${userId}`

let client: RedisClientType | null = null
let connecting: Promise<void> | null = null
let disabledUntil = 0
const DISABLE_MS = 30_000
const CONNECT_WAIT_MS = 250

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("presence store connect timed out")), ms)
        promise.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (err) => { clearTimeout(timer); reject(err) },
        )
    })

const connect = async () => {
    if (client?.isReady) return
    if (Date.now() < disabledUntil) throw new Error("presence store temporarily disabled")
    if (!connecting) {
        connecting = (async () => {
            const c = createClient({
                url: env.REDIS_URL,
                socket: { reconnectStrategy: (retries) => (retries > 5 ? new Error("giving up") : Math.min(retries * 200, 2000)) },
            }) as RedisClientType
            c.on("error", (err) => console.error("Redis presence client error:", err.message))
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

// Fire-and-forget on purpose (matches auditService.record's own non-blocking writes elsewhere) —
// a socket connecting/disconnecting shouldn't stall on a database round trip either.
const touchLastActive = (userId: string) => {
    db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId))
        .catch((err) => console.error("Failed to update lastActiveAt:", err))
}

export const presenceService = {
    // A user can have several tabs/sockets open at once — "online" means "at least one socket in
    // their set", so this only ever ADDS to it; connectSocket (client/src/lib/socket.ts) already
    // dedupes multiple tabs down to one real connection, but a second browser or device is still a
    // second, independent socket here.
    async markConnected(userId: string, socketId: string) {
        touchLastActive(userId)
        try {
            await withTimeout(connect(), CONNECT_WAIT_MS)
            await client!.sAdd(socketsKey(userId), socketId)
            await client!.sAdd(ONLINE_SET_KEY, userId)
        } catch {
            // Presence is best-effort — see file header.
        }
    },

    async markDisconnected(userId: string, socketId: string) {
        touchLastActive(userId)
        try {
            await withTimeout(connect(), CONNECT_WAIT_MS)
            await client!.sRem(socketsKey(userId), socketId)
            const remaining = await client!.sCard(socketsKey(userId))
            if (remaining === 0) await client!.sRem(ONLINE_SET_KEY, userId)
        } catch {
            // Same as above — a failed cleanup just means this user shows "online" a bit longer
            // than they really are, never a crash.
        }
    },

    // Every currently-online user id, for the presence list endpoint — empty (not an error) when
    // Redis is unreachable, so a down cache degrades to "nobody's online" rather than a 500.
    async getOnlineUserIds(): Promise<Set<string>> {
        try {
            await withTimeout(connect(), CONNECT_WAIT_MS)
            const ids = await client!.sMembers(ONLINE_SET_KEY)
            return new Set(ids)
        } catch {
            return new Set()
        }
    },
}
