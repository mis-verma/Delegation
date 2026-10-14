import { io , type Socket } from "socket.io-client";
import { tokenStore } from "./tokenStore";
import { apiFetch } from "../api/http";

const BASE = ( import.meta.env.VITE_API_URL as string  | undefined)

let socket : Socket | null = null;
let refCount = 0
let lastTokenRefreshTry = 0
const TOKEN_REFRESH_COOLDOWN_MS = 10_000

export const connectSocket = ( token : string) : Socket => {
    // Every caller of connectSocket() is expected to call releaseSocket() exactly once when done
    // (see useNotificationSocket's cleanup) — so the count must go up on every call that hands out
    // a reference, not only the call that happens to create the underlying socket. Incrementing
    // only inside the "create new" branch undercounts concurrent consumers of the shared socket
    // and lets the first one to unmount disconnect it out from under the others.
    refCount += 1;
    if (socket ) return socket;
    const created = io(BASE , {
        // A function, not a fixed `{ token }`: it runs on every (re)connect, so a connection that drops
        // later (a deploy, a network blip, a laptop waking up) presents the CURRENT access token. The
        // server rejects a token older than 15 minutes, and a fixed object kept sending the one this
        // socket was created with, so live updates stopped for good after the first long disconnect.
        auth : (cb) => cb({ token : tokenStore.get() ?? token }),
    });
    // The server's login check can still refuse a token that expired while the tab sat idle. Socket.IO
    // does not retry on its own after a refusal, so refresh the token through the normal API path
    // (a 401 there triggers the usual refresh), then connect again with it. Rate-limited so a person
    // who really is signed out does not loop.
    created.on("connect_error", (err) => {
        if (!/access token/i.test(err.message)) return;
        const now = Date.now();
        if (now - lastTokenRefreshTry < TOKEN_REFRESH_COOLDOWN_MS) return;
        lastTokenRefreshTry = now;
        apiFetch("/users/me").then(() => { if (socket === created) created.connect(); }).catch(() => {});
    });
    socket = created;
    return socket;
};

// The only teardown path. There used to be a `disconnectSocket()` alongside this that dropped the
// connection regardless of refCount, and the task and ticket hooks each called it right after
// releaseSocket() — so whichever unmounted first disconnected the socket the other two consumers
// were still using. Signing out is covered without it: token goes null, all three hooks clean up,
// refCount reaches 0 here and the socket closes.
export const releaseSocket = () => {
    refCount = Math.max(0, refCount - 1);
    if(refCount === 0){
        socket?.disconnect();
        socket = null;
    }
}