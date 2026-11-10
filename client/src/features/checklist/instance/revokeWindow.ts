export const REVOKE_WINDOW_MS = 10 * 60 * 1000;

export const revokeMsLeft = (submittedAt: string | null | undefined, now: number): number => {
  if (!submittedAt) return 0;
  const sent = new Date(submittedAt).getTime();
  if (!Number.isFinite(sent)) return 0;
  return Math.max(0, sent + REVOKE_WINDOW_MS - now);
};
