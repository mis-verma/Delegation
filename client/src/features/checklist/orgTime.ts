const DEFAULT_ORG_TZ_OFFSET_MINUTES = 330;
const MAX_OFFSET_MINUTES = 14 * 60;

export let ORG_TZ_OFFSET_MS = DEFAULT_ORG_TZ_OFFSET_MINUTES * 60_000;

export const setOrgTzOffsetMinutes = (minutes: number | undefined): void => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || Math.abs(minutes) > MAX_OFFSET_MINUTES) return;
  ORG_TZ_OFFSET_MS = minutes * 60_000;
};

export const orgDayKey = (ms: number): string => new Date(ms + ORG_TZ_OFFSET_MS).toISOString().slice(0, 10);

export const orgWeekday = (ms: number = Date.now()): number => new Date(ms + ORG_TZ_OFFSET_MS).getUTCDay();

export const startOfOrgDay = (now: number = Date.now()): number => {
  const local = new Date(now + ORG_TZ_OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - ORG_TZ_OFFSET_MS;
};
