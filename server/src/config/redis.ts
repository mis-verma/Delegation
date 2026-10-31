import { createClient, type RedisClientType } from "redis";
import { RedisStore } from "rate-limit-redis"
import { env } from "./env.js"
import { resilientStore } from "./resilientStore.js"

const reconnectStrategy = (retries : number) => Math.min(retries * 200, 5000)

const FIRST_CONNECT_DEADLINE_MS = 15_000
const connectOrFail = (connecting: Promise<unknown>, label: string) =>
    new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Redis (${label}) did not connect within ${FIRST_CONNECT_DEADLINE_MS / 1000}s. Is Redis running at REDIS_URL?`)), FIRST_CONNECT_DEADLINE_MS)
        connecting.then(
            () => { clearTimeout(timer); resolve() },
            (err) => { clearTimeout(timer); reject(err) },
        )
    })

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

export const createRedisRateLimitStoreFactory = async () => {
    const client = createClient({ url : env.REDIS_URL , socket : { reconnectStrategy}, disableOfflineQueue: true }) as RedisClientType
    client.on("error" , (err) => console.error("Redis rate-limit client error:", err.message ))
    await connectOrFail(client.connect(), "rate-limit");
    trackedClients.push(client);

    return (prefix: string) => resilientStore(new RedisStore({
        prefix: `rl:${prefix}:`,
        sendCommand : (...args : string[]) => client.sendCommand(args)
    }))
}

export const disconnectRedisClients = async () => {
    await Promise.all(
        trackedClients.map((c) => (c.isOpen ? c.disconnect().catch((err) => console.error("Failed to close a Redis client:", err)) : Promise.resolve()))
    );
}