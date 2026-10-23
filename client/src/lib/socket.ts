import type { Socket } from "socket.io-client";
import { tokenStore } from "./tokenStore";
import { apiFetch } from "../api/http";

const BASE = ( import.meta.env.VITE_API_URL as string  | undefined)

type Handler = (...args: never[]) => void;

export interface LiveSocket {
    on: (event: string, handler: Handler) => void;
    off: (event: string, handler: Handler) => void;
}

let socket : Socket | null = null;
let started = false;
let refCount = 0
let lastTokenRefreshTry = 0
const TOKEN_REFRESH_COOLDOWN_MS = 10_000
const listeners: { event: string; handler: Handler }[] = [];

const asListener = (handler: Handler) => handler as (...args: unknown[]) => void;

const liveSocket: LiveSocket = {
    on: (event, handler) => {
        listeners.push({ event, handler });
        socket?.on(event, asListener(handler));
    },
    off: (event, handler) => {
        const at = listeners.findIndex((l) => l.event === event && l.handler === handler);
        if (at >= 0) listeners.splice(at, 1);
        socket?.off(event, asListener(handler));
    },
};

const whenIdle = (run: () => void) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 1500 });
    else window.setTimeout(run, 300);
};

const openSocket = async (token: string) => {
    const { io } = await import("socket.io-client");
    if (refCount === 0) {
        started = false;
        return;
    }
    if (socket) return;
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
    listeners.forEach((l) => created.on(l.event, asListener(l.handler)));
};

export const connectSocket = ( token : string) : LiveSocket => {
    refCount += 1;
    if (!started) {
        started = true;
        whenIdle(() => { void openSocket(token); });
    }
    return liveSocket;
};

export const releaseSocket = () => {
    refCount = Math.max(0, refCount - 1);
    if(refCount === 0){
        socket?.disconnect();
        socket = null;
        started = false;
    }
}
