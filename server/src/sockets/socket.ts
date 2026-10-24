import { Server as HttpServer } from "node:http"
import { Server as SocketIOServer, type Socket } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import jwt from "jsonwebtoken"
import { eq } from "drizzle-orm"
import { env } from "../config/env.js"
import { db } from "../config/db.js"
import { users } from "../db/schema/core.js"
import { tokenPredatesPasswordChange, type AccessTokenPayload } from "../middleware/auth/auth.js"
import { createRedisPubSubClients } from "../config/redis.js"
import { presenceService, HEARTBEAT_MS } from "../modules/presence/presence.service.js"

let io: SocketIOServer | undefined;

const userRoom = (userId: string) => `user:${userId}`

export const disconnectUserSockets = (userId: string) => {
    if (!io) return;
    try {
        io.in(userRoom(userId)).disconnectSockets(true);
    } catch (err) {
        console.error("Failed to disconnect sockets for user", userId, err);
    }
}

export const initSocket = async (httpServer: HttpServer, useRedisAdapter: boolean): Promise<SocketIOServer> => {
    io = new SocketIOServer(httpServer, {
        cors: { origin: env.CLIENT_URL, credentials: true },
    });

    if (useRedisAdapter) {
        const { pubClient, subClient } = await createRedisPubSubClients();
        io.adapter(createAdapter(pubClient, subClient));
    }

    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) return next(new Error("Missing access token"));

        let payload: AccessTokenPayload;
        try {
            payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
        } catch {
            return next(new Error("Invalid access token"));
        }

        try {
            const [current] = await db.select({
                role: users.role,
                isActive: users.isActive,
                departmentId: users.departmentId,
                storeId: users.storeId,
                passwordChangedAt: users.passwordChangedAt,
                mustChangePassword: users.mustChangePassword,
            }).from(users).where(eq(users.id, payload.sub)).limit(1);

            if (!current || !current.isActive) return next(new Error("Account is no longer active"));
            if (tokenPredatesPasswordChange(payload.iat, current.passwordChangedAt)) return next(new Error("Invalid access token"));
            if (current.mustChangePassword) return next(new Error("Choose your own password before you continue."));

            socket.data.user = {
                sub: payload.sub,
                role: current.role,
                departmentId: current.departmentId ?? undefined,
                storeId: current.storeId ?? undefined,
            } satisfies AccessTokenPayload;
            next();
        } catch (err) {
            console.error("Socket auth lookup failed:", err);
            next(new Error("Could not verify account"));
        }
    });

    io.on("connection", (socket: Socket) => {
        const user = socket.data.user as AccessTokenPayload;
        socket.join(userRoom(user.sub));
        socket.join(`role:${user.role}`);
        if (user.departmentId) socket.join(`department:${user.departmentId}`);
        if (user.storeId) socket.join(`store:${user.storeId}`)

        presenceService.markConnected(user.sub, socket.id);
        const beat = setInterval(() => { void presenceService.heartbeat(user.sub, socket.id) }, HEARTBEAT_MS);
        socket.on("disconnect", () => {
            clearInterval(beat);
            presenceService.markDisconnected(user.sub, socket.id);
        });
    })

    return io;
}

export const getIO = (): SocketIOServer => {
    if (!io) throw new Error("Socket.io not initialized");
    return io;
}
