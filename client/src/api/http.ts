import { tokenStore } from '../lib/tokenStore';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

// The refresh token is single-use (rotated server-side on every call), so two tabs racing to
// refresh at once will make the loser reuse an already-revoked token and get force-logged-out —
// this happens routinely since the access token only lives 15 minutes. `navigator.locks`
// serializes refresh attempts across every tab/worker on this origin; whichever tab loses the
// race for the lock then notices `staleToken` no longer matches the (now-rotated) stored token
// and just reuses that instead of calling the endpoint a second time with a dead token.
const refreshAccessToken = (staleToken: string | null): Promise<string | null> => {
  const doRefresh = async () => {
    const latest = tokenStore.get();
    if (latest && latest !== staleToken) return latest;

    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      const newToken = data.accessToken as string;
      tokenStore.set(newToken);
      return newToken;
    } catch {
      return null;
    }
  };

  if ('locks' in navigator) {
    return navigator.locks.request('tm-auth-refresh', doRefresh);
  }
  return doRefresh();
};

// Thrown for any non-ok response so callers (see queryHelpers.ts's handleQueryRetry) can branch
// on the actual HTTP status — a plain Error has nowhere to carry that.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const forceLogout = () => {
  // Best-effort, not awaited: the refresh token is almost certainly already dead (that's why
  // refreshAccessToken just failed), but if it's somehow still valid server-side this revokes it
  // instead of leaving it usable. A raw fetch, not authApi.logout()/apiFetch — this file is what
  // apiFetch itself lives in, so importing back from api/auth.ts here would be circular.
  fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  localStorage.removeItem('tm-user');
  tokenStore.set(null);
  // A hard redirect, not an in-app navigate: this path only runs when the session has already
  // died out from under an in-flight request, so there's no in-progress UI worth preserving — a
  // full reload guarantees every bit of stale in-memory state (including the React Query cache
  // AuthContext.logout otherwise clears by hand) is gone, with no separate cleanup call to keep in
  // sync with that one.
  window.location.href = '/login';
};

export const apiFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const isAuthEndpoint = path.startsWith('/auth/');
  const token = tokenStore.get();
  // FormData bodies (file uploads) need the browser to set their own
  // `multipart/form-data; boundary=...` header — forcing 'application/json' here would corrupt them.
  const isFormData = options.body instanceof FormData;

  const doFetch = (t: string | null) =>
    fetch(`${BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...options.headers,
      },
    });

  // A genuine network failure (offline, DNS, CORS) throws a raw, browser-worded TypeError here
  // ("Failed to fetch" and similar) — every other failure path in this function already surfaces a
  // clean message, so this is the one spot that could still show a user something like that.
  let res: Response;
  try {
    res = await doFetch(token);
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  if (res.status === 401 && token && !isAuthEndpoint) {
    const newToken = await refreshAccessToken(token);
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      forceLogout();
      throw new Error('Your session has ended. Please sign in again.');
    }
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message ?? 'Something went wrong. Please try again.', res.status);
  return data as T;
};

/** Which slice of the work a summary counts: `mine` is work assigned to the signed-in user,
 *  `visible` is everything their role can see (org-wide for ADMIN/PC, department for HODs). */
export type SummaryScope = 'mine' | 'visible';

/** A pending-approval preview: the oldest few rows plus the true queue size, so a card can say
 *  "+12 more" instead of implying the preview is the whole queue. */
export type PendingApprovalPreview<T> = { rows: T[]; total: number };
