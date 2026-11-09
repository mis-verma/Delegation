export const DEFAULT_AUTO_CLOSE_DAYS = 3;
export const MAX_AUTO_CLOSE_DAYS = 30;
const DAY_MS = 86_400_000;

export const autoCloseDaysFrom = (value: number | null | undefined): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  const days = Math.trunc(value);
  if (days <= 0) return null;
  return Math.min(days, MAX_AUTO_CLOSE_DAYS);
};

export const autoCloseCutoff = (now: Date, days: number): Date => new Date(now.getTime() - days * DAY_MS);

export const dayCount = (days: number): string => `${days} ${days === 1 ? 'day' : 'days'}`;

export const autoCloseNote = (days: number): string =>
  `Closed automatically. Nobody approved it within ${dayCount(days)}.`;
