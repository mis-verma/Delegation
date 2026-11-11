const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  apiUrl: (process.env.KARYA_API_URL ?? 'http://localhost:5050').replace(/\/+$/, ''),
  token: process.env.KARYA_TOKEN?.trim() || null,
  email: process.env.KARYA_EMAIL?.trim() || null,
  password: process.env.KARYA_PASSWORD || null,
  allowWrites: process.env.KARYA_ALLOW_WRITES === '1',
  maxRows: Math.min(num(process.env.KARYA_MAX_ROWS, 25), 50),
  utcOffsetMinutes: num(process.env.KARYA_UTC_OFFSET_MINUTES, 330),
  timeoutMs: num(process.env.KARYA_TIMEOUT_MS, 15_000),
} as const;

export const hasCredentials = () => !!config.token || (!!config.email && !!config.password);

export const orgToday = (now: number = Date.now()): string =>
  new Date(now + config.utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
