import { io , type Socket } from "socket.io-client";
import { tokenStore } from "./tokenStore";
import { apiFetch } from "../api/http";

const BASE = ( import.meta.env.VITE_API_URL as string  | undefined)

let socket : Socket | null = null;
let refCount = 0
let lastTokenRefreshTry = 0
const TOKEN_REFRESH_COOLDOWN_MS = 10_000

export const connectSocket = ( token : string) : Socket => {
    refCount += 1;
    if (socket ) return socket;
    const created = io(BASE , {
        auth : (cb) => cb({ token : tokenStore.get() ?? token }),
    });
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

export const releaseSocket = () => {
    refCount = Math.max(0, refCount - 1);
    if(refCount === 0){
        socket?.disconnect();
        socket = null;
    }
}