import { ApiError } from '../../api/http';

const PER_MINUTE = 180;
const PARALLEL = 4;
const MAX_RETRIES = 2;
const FALLBACK_WAIT_MS = 3_000;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export interface PacedResult<T> {
  ok: T[];
  failed: T[];
}

export const runPaced = async <T>(items: readonly T[], task: (item: T) => Promise<unknown>, onProgress?: (done: number) => void): Promise<PacedResult<T>> => {
  const gap = 60_000 / PER_MINUTE;
  const ok: T[] = [];
  const failed: T[] = [];
  let next = 0;
  let nextStart = 0;

  const takeSlot = async () => {
    const now = Date.now();
    const at = Math.max(now, nextStart);
    nextStart = at + gap;
    if (at > now) await sleep(at - now);
  };

  const attempt = async (item: T) => {
    for (let tries = 0; ; tries++) {
      await takeSlot();
      try {
        await task(item);
        return true;
      } catch (err) {
        const throttled = err instanceof ApiError && err.status === 429;
        if (!throttled || tries >= MAX_RETRIES) return false;
        const wait = err.retryAfterMs ?? FALLBACK_WAIT_MS;
        nextStart = Math.max(nextStart, Date.now() + wait);
      }
    }
  };

  const worker = async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      if (await attempt(item)) ok.push(item);
      else failed.push(item);
      onProgress?.(ok.length + failed.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return { ok, failed };
};
