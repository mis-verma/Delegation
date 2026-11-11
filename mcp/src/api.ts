import { config } from './config.js';

export class KaryaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'KaryaApiError';
  }
}

type Params = Record<string, string | number | boolean | undefined>;

let accessToken: string | null = config.token;

const messageFrom = (body: unknown, fallback: string): string => {
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};

const request = async (path: string, init: RequestInit & { auth?: boolean } = {}): Promise<unknown> => {
  const { auth = true, ...rest } = init;
  const headers: Record<string, string> = { Accept: 'application/json', ...(rest.headers as Record<string, string> | undefined) };
  if (rest.body) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${config.apiUrl}${path}`, { ...rest, headers, signal: AbortSignal.timeout(config.timeoutMs) });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) throw new KaryaApiError(messageFrom(body, `KaryaOS answered ${response.status}.`), response.status);
  return body;
};

const signIn = async (): Promise<void> => {
  if (!config.email || !config.password) {
    throw new KaryaApiError('The KaryaOS token expired. Set a fresh KARYA_TOKEN, or set KARYA_EMAIL and KARYA_PASSWORD so the server can sign in itself.', 401);
  }
  const body = (await request('/auth/login', { method: 'POST', auth: false, body: JSON.stringify({ email: config.email, password: config.password }) })) as {
    accessToken?: string;
    codeRequired?: boolean;
  } | null;
  if (body?.codeRequired) {
    throw new KaryaApiError('This account needs an email sign-in code, so it cannot sign in unattended. Use KARYA_TOKEN or a non-admin account.', 401);
  }
  if (!body?.accessToken) throw new KaryaApiError('KaryaOS sign-in did not return a token.', 401);
  accessToken = body.accessToken;
};

export const apiGet = async <T = unknown>(path: string, params: Params = {}): Promise<T> => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
  const target = query.size ? `${path}?${query.toString()}` : path;
  if (!accessToken) await signIn();
  try {
    return (await request(target)) as T;
  } catch (err) {
    if (err instanceof KaryaApiError && err.status === 401 && config.email && config.password) {
      await signIn();
      return (await request(target)) as T;
    }
    throw err;
  }
};
