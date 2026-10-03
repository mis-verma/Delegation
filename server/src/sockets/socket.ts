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

// The personal room every socket of one user joins (also what notification.service.ts emits to).
const userRoom = (userId: string) => `user:${userId}`

// Drops every live socket of this user (all tabs/devices, across workers when the Redis adapter is
// on) so they reconnect with fresh credentials, or can't reconnect at all if they were switched off.
// Called after a role/department/store/active change, an offboard, a delete and a password reset.
// Quietly does nothing when sockets aren't running (scripts, tests).
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

    // Only needed once more than one process is serving sockets — a single process doesn't
    // benefit from it, and shouldn't be forced to depend on a running Redis instance.
    if (useRedisAdapter) {
        const { pubClient, subClient } = await createRedisPubSubClients();
        io.adapter(createAdapter(pubClient, subClient));
    }

    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) return next(new Error("Missing access token"));

        let payload: AccessTokenPayload;
        try {
            // Pinned to HS256 (what signAccessToken actually uses) — same hardening as auth.ts's authenticate.
            payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
        } catch {
            return next(new Error("Invalid access token"));
        }

        // Same re-check authenticate() does on every HTTP request: the JWT's own role/department/
        // store claims go stale the moment an admin changes them, so rooms are built from the
        // database row, and a deactivated person (or one whose password changed) never connects.
        try {
            const [current] = await db.select({
                role: users.role,
                isActive: users.isActive,
                departmentId: users.departmentId,
                storeId: users.storeId,
                passwordChangedAt: users.passwordChangedAt,
            }).from(users).where(eq(users.id, payload.sub)).limit(1);

            if (!current || !current.isActive) return next(new Error("Account is no longer active"));
            if (tokenPredatesPasswordChange(payload.iat, current.passwordChangedAt)) return next(new Error("Invalid access token"));

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
        // Keeps this socket's presence key from expiring while it is really connected.
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
