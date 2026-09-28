import { API_BASE_URL } from "./config";
import { tokenStore } from "../auth/tokenStore";

// Same non-ok-response wrapper as client/src/api/http.ts's ApiError, so screens can branch on the
// real HTTP status instead of parsing a message string.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Called once, on cold start, before anything else touches the API — set by AuthContext.
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (handler: (() => void) | null) => {
  onSessionExpired = handler;
};

// The refresh token is single-use (rotated server-side on every call) — the web client serializes
// concurrent refreshes across tabs with navigator.locks, which doesn't exist in React Native. A
// single in-memory in-flight promise does the same job for the one JS thread this app runs on:
// every caller that shows up while a refresh is already running just awaits that same promise
// instead of firing a second request with a token that's about to be dead.
let refreshInFlight: Promise<string | null> | null = null;

const refreshAccessToken = (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const refreshToken = await tokenStore.getRefreshToken();
      if (!refreshToken) return null;

      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;

      const data = await res.json();
      tokenStore.setAccessToken(data.accessToken);
      await tokenStore.setRefreshToken(data.refreshToken);
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

const forceLogout = async () => {
  await tokenStore.setRefreshToken(null);
  tokenStore.setAccessToken(null);
  onSessionExpired?.();
};

export const apiFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const isAuthEndpoint = path.startsWith("/auth/");
  const token = tokenStore.getAccessToken();
  const isFormData = options.body instanceof FormData;

  const doFetch = (t: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...options.headers,
      },
    });

  let res: Response;
  try {
    res = await doFetch(token);
  } catch {
    throw new Error("Network error — check your connection and try again");
  }

  if (res.status === 401 && token && !isAuthEndpoint) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      await forceLogout();
      throw new Error("Session expired — please log in again");
    }
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message ?? "Request failed", res.status);
  return data as T;
};
