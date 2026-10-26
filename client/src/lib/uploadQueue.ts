import { ApiError } from '../api/http';

const MAX_CONCURRENT = 2;
const MAX_RETRIES = 2;
const BASE_WAIT_MS = 1000;

interface Job {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const waiting: Job[] = [];
let active = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const whenOnline = (): Promise<void> =>
  navigator.onLine ? Promise.resolve() : new Promise<void>((resolve) => window.addEventListener('online', () => resolve(), { once: true }));

const neverReachedServer = (err: unknown) => err instanceof ApiError && err.status === 0;

const attempt = async (run: () => Promise<unknown>): Promise<unknown> => {
  for (let tries = 0; ; tries++) {
    await whenOnline();
    try {
      return await run();
    } catch (err) {
      if (tries >= MAX_RETRIES || !neverReachedServer(err)) throw err;
      await sleep(BASE_WAIT_MS * 2 ** tries);
    }
  }
};

const pump = () => {
  while (active < MAX_CONCURRENT && waiting.length > 0) {
    const job = waiting.shift()!;
    active += 1;
    attempt(job.run)
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  }
};

export const enqueueUpload = <T>(run: () => Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    waiting.push({ run, resolve: resolve as (value: unknown) => void, reject });
    pump();
  });
