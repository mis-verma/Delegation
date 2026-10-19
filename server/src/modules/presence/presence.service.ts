import { createClient, type RedisClientType } from "redis"
import { env } from "../../config/env.js"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/core.js"
import { eq } from "drizzle-orm"

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

const touchLastActive = (userId: string) => {
    db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId))
        .catch((err) => console.error("Failed to update lastActiveAt:", err))
}

export const SOCKET_KEY_TTL_SECONDS = 90
export const HEARTBEAT_MS = 30_000

export const presenceService = {
    async markConnected(userId: string, socketId: string) {
        touchLastActive(userId)
        await this.heartbeat(userId, socketId)
    },

    async heartbeat(userId: string, socketId: string) {
        try {
            await withTimeout(connect(), CONNECT_WAIT_MS)
            await client!.sAdd(socketsKey(userId), socketId)
            await client!.expire(socketsKey(userId), SOCKET_KEY_TTL_SECONDS)
            await client!.sAdd(ONLINE_SET_KEY, userId)
        } catch {
        }
    },

    async clearStale() {
        try {
            await withTimeout(connect(), CONNECT_WAIT_MS)
            await client!.del(ONLINE_SET_KEY)
            for await (const batch of client!.scanIterator({ MATCH: "presence:sockets:*", COUNT: 100 })) {
                const keys = Array.isArray(batch) ? batch : [batch]
                if (keys.length) await client!.del(keys)
            }
        } catch {
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
        }
    },

    async getOnlineUserIds(): Promise<Set<string>> {
        try {
            await withTimeout(connect(), CONNECT_WAIT_MS)
            const ids = await client!.sMembers(ONLINE_SET_KEY)
            const online = new Set<string>()
            for (const id of ids) {
                if (await client!.exists(socketsKey(id))) online.add(id)
                else await client!.sRem(ONLINE_SET_KEY, id)
            }
            return online
        } catch {
            return new Set()
        }
    },
}
