import { createClient, type RedisClientType } from "redis";
import { RedisStore } from "rate-limit-redis"
import { env } from "./env.js"

const reconnectStrategy = ( retries : number) => {
    if(retries > 5 ) return new Error("Redis unreachable after 5 attemps - giving up.")
    return Math.min(retries * 200, 2000)
}

// Every client this module hands out gets tracked here so shutdown() (server.ts) can close them
// on SIGINT/SIGTERM — previously only the MySQL pool was disconnected on shutdown, leaving these
// sockets open until the process actually exited instead of closing cleanly.
const trackedClients: RedisClientType[] = [];

export const createRedisPubSubClients = async () => {
    const pubClient = createClient({ url : env.REDIS_URL , socket : { reconnectStrategy }}) as RedisClientType;
    const subClient = pubClient.duplicate();

    pubClient.on("error", (err) => console.error("Redis pub client error:" , err))
    subClient.on("error", (err) => console.error("Redis sub client error : ", err))

    await Promise.all([pubClient.connect(), subClient.connect()]);
    trackedClients.push(pubClient, subClient);
    return { pubClient, subClient}
}

export const createRedisRateLimitStore = async () => {
    const client = createClient({ url : env.REDIS_URL , socket : { reconnectStrategy}}) as RedisClientType
    client.on("error" , (err) => console.error("Redis rate-limit client error:", err.message ))
    await client.connect();
    trackedClients.push(client);

    return new RedisStore({
        sendCommand : (...args : string[]) => client.sendCommand(args)
    })
}

export const disconnectRedisClients = async () => {
    await Promise.all(
        trackedClients.map((c) => (c.isOpen ? c.disconnect().catch((err) => console.error("Failed to close a Redis client:", err)) : Promise.resolve()))
    );
}