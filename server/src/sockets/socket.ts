import { Server as HttpServer } from "node:http"
import { Server as SocketIOServer, type Socket } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import jwt from "jsonwebtoken"
import { env } from "../config/env.js"
import type { AccessTokenPayload } from "../middleware/auth/auth.js"
import { createRedisPubSubClients } from "../config/redis.js"
import { presenceService } from "../modules/presence/presence.service.js"

let io: SocketIOServer | undefined;

export const initSocket = async (httpServer: HttpServer, useRedisAdapter: boolean): Promise<SocketIOServer> => {
    io = new SocketIOServer(httpServer, {
        cors: { origin: env.CLIENT_URL, credentials: true },
    });

    // Only needed once more than one process is serving sockets — a single process doesn't
    // benefit from it, and shouldn't be forced to depend on a running Redis instance.
    if (useRedisAdapter) {
        const { pubClient, subClient } = await createRedisPubSubClients();
        io.adapter(createAdapter(pubClient, subClient));
    }

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) return next(new Error("Missing access token"));
        try {
            // Pinned to HS256 (what signAccessToken actually uses) — same hardening as auth.ts's authenticate.
            socket.data.user = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
            next()
        } catch {
            next(new Error("Invalid access token"))
        }
    });

    io.on("connection", (socket: Socket) => {
        const user = socket.data.user as AccessTokenPayload;
        socket.join(`user:${user.sub}`);
        socket.join(`role:${user.role}`);
        if (user.departmentId) socket.join(`department:${user.departmentId}`);
        if (user.storeId) socket.join(`store:${user.storeId}`)

        presenceService.markConnected(user.sub, socket.id);
        socket.on("disconnect", () => presenceService.markDisconnected(user.sub, socket.id));
    })

    return io;
}

export const getIO = (): SocketIOServer => {
    if (!io) throw new Error("Socket.io not initialized");
    return io;
}
