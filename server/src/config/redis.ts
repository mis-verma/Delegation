import { createClient, type RedisClientType } from "redis";
import { RedisStore } from "rate-limit-redis"
import { env } from "./env.js"

// const reconnectStrategy = ( retries : number) => {
//     if(retries > 5 ) return new Error("Redis unreachable after 5 attemps - giving up.")
//     return Math.min(retries * 200, 2000)
// }

const reconnectStrategy = (retries : number) => Math.min(retries * 200, 5000)

// The clients retry forever once running, which also means a first connect to an unreachable Redis
// would never settle and the server would sit at startup silently. Give the first connect a deadline
// so boot fails loudly (the process manager restarts it) instead of hanging.
const FIRST_CONNECT_DEADLINE_MS = 15_000
const connectOrFail = (connecting: Promise<unknown>, label: string) =>
    new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Redis (${label}) did not connect within ${FIRST_CONNECT_DEADLINE_MS / 1000}s. Is Redis running at REDIS_URL?`)), FIRST_CONNECT_DEADLINE_MS)
        connecting.then(
            () => { clearTimeout(timer); resolve() },
            (err) => { clearTimeout(timer); reject(err) },
        )
    })

// Every client this module hands out gets tracked here so shutdown() (server.ts) can close them
// on SIGINT/SIGTERM — previously only the MySQL pool was disconnected on shutdown, leaving these
// sockets open until the process actually exited instead of closing cleanly.
const trackedClients: RedisClientType[] = [];

export const createRedisPubSubClients = async () => {
    const pubClient = createClient({ url : env.REDIS_URL , socket : { reconnectStrategy }}) as RedisClientType;
    const subClient = pubClient.duplicate();

    pubClient.on("error", (err) => console.error("Redis pub client error:" , err))
    subClient.on("error", (err) => console.error("Redis sub client error : ", err))

    await connectOrFail(Promise.all([pubClient.connect(), subClient.connect()]), "pub/sub");
    trackedClients.push(pubClient, subClient);
    return { pubClient, subClient}
}

// One shared connection, handed out as a *factory* rather than a single Store instance — app.ts
// wires up six separate rate limiters (api/auth/auth-refresh/ai/whatsapp-webhook/doubletick-webhook)
// off this same client, and express-rate-limit's RedisStore validates at construction time that a
// Store instance is never reused across more than one limiter (each limiter needs its own, or they'd
// silently share Redis keys and count against each other's budget). `prefix` is what actually keeps
// each limiter's keys apart in Redis; the distinct RedisStore *object* per call is what satisfies
// express-rate-limit's own reuse check.
export const createRedisRateLimitStoreFactory = async () => {
    // disableOfflineQueue: while Redis is away, limiter commands fail at once (and passOnStoreError
    // lets the request through) instead of queueing until it returns, which would hang every request.
    const client = createClient({ url : env.REDIS_URL , socket : { reconnectStrategy}, disableOfflineQueue: true }) as RedisClientType
    client.on("error" , (err) => console.error("Redis rate-limit client error:", err.message ))
    await connectOrFail(client.connect(), "rate-limit");
    trackedClients.push(client);

    return (prefix: string) => new RedisStore({
        prefix: `rl:${prefix}:`,
        sendCommand : (...args : string[]) => client.sendCommand(args)
    })
}

export const disconnectRedisClients = async () => {
    await Promise.all(
        trackedClients.map((c) => (c.isOpen ? c.disconnect().catch((err) => console.error("Failed to close a Redis client:", err)) : Promise.resolve()))
    );
}