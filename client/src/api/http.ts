import { tokenStore } from '../lib/tokenStore';
import { viewAsStore } from '../lib/viewAsStore';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

const REFRESH_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 5000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const refreshAccessToken = (staleToken: string | null): Promise<string | null> => {
  const doRefresh = async (): Promise<string | null> => {
    const latest = tokenStore.get();
    if (latest && latest !== staleToken) return latest;

    for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt++) {
      let waitMs = 500 * attempt;
      try {
        const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (res.status === 401 || res.status === 403) return null;
        if (res.ok) {
          const data = await res.json();
          const newToken = data?.accessToken as string | undefined;
          if (newToken) {
            tokenStore.set(newToken);
            return newToken;
          }
        }
        const retryAfter = Number(res.headers.get('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) waitMs = Math.min(retryAfter * 1000, MAX_RETRY_WAIT_MS);
      } catch {
      }
      if (attempt < REFRESH_ATTEMPTS) await sleep(waitMs);
    }
    throw new ApiError('The server is busy. Please try again in a moment.', 503);
  };

  if ('locks' in navigator) {
    return navigator.locks.request('tm-auth-refresh', doRefresh);
  }
  return doRefresh();
};

export class ApiError extends Error {
  status: number;
  retryAfterMs?: number;
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const retryAfterMsOf = (res: Response): number | undefined => {
  const seconds = Number(res.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
};

const forceLogout = () => {
  fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  localStorage.removeItem('tm-user');
  tokenStore.set(null);
  window.location.href = '/login';
};

export const apiFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const isAuthEndpoint = path.startsWith('/auth/');
  const previewId = isAuthEndpoint || path.startsWith('/view-as/') ? null : viewAsStore.get();
  if (previewId && !['GET', 'HEAD'].includes((options.method ?? 'GET').toUpperCase())) {
    throw new ApiError('You are previewing someone else’s account, so nothing can be changed. Exit the preview first.', 403);
  }
  const token = tokenStore.get();
  const isFormData = options.body instanceof FormData;

  const doFetch = (t: string | null) =>
    fetch(`${BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...(previewId ? { 'X-View-As': previewId } : {}),
        ...options.headers,
      },
    });

  let res: Response;
  try {
    res = await doFetch(token);
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0);
  }

  if (res.status === 401 && token && !isAuthEndpoint) {
    const newToken = await refreshAccessToken(token);
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      forceLogout();
      throw new ApiError('Your session has ended. Please sign in again.', 401);
    }
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message ?? 'Something went wrong. Please try again.', res.status, retryAfterMsOf(res));
  return data as T;
};

export type UploadProgress = (fraction: number) => void;

type XhrResult = { status: number; data: { message?: string } | null; retryAfterMs?: number };

const parseBody = (text: string): XhrResult['data'] => {
  try {
    return JSON.parse(text) as XhrResult['data'];
  } catch {
    return null;
  }
};

const xhrPost = (path: string, body: FormData, token: string | null, previewId: string | null, onProgress?: UploadProgress): Promise<XhrResult> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);
    xhr.withCredentials = true;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (previewId) xhr.setRequestHeader('X-View-As', previewId);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      const data = parseBody(xhr.responseText);
      const seconds = Number(xhr.getResponseHeader('Retry-After'));
      resolve({ status: xhr.status, data, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined });
    };
    const failed = () => reject(new ApiError("Couldn't reach the server. Check your connection and try again.", 0));
    xhr.onerror = failed;
    xhr.ontimeout = failed;
    xhr.send(body);
  });

export const apiUpload = async <T>(path: string, body: FormData, onProgress?: UploadProgress): Promise<T> => {
  const previewId = viewAsStore.get();
  if (previewId) {
    throw new ApiError('You are previewing someone else’s account, so nothing can be changed. Exit the preview first.', 403);
  }
  const token = tokenStore.get();
  let res = await xhrPost(path, body, token, null, onProgress);
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken(token);
    if (!newToken) {
      forceLogout();
      throw new ApiError('Your session has ended. Please sign in again.', 401);
    }
    res = await xhrPost(path, body, newToken, null, onProgress);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(res.data?.message ?? 'Something went wrong. Please try again.', res.status, res.retryAfterMs);
  }
  return res.data as T;
};

export type SummaryScope = 'mine' | 'visible';

export type PendingApprovalPreview<T> = { rows: T[]; total: number };
