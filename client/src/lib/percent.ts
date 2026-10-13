// One place that turns a percentage into text or a spreadsheet number, so every screen and every export
// shows the same figure. The server sends at most one decimal. We keep it, and we never let rounding
// promise more than the data says: 99.96 is not "100%" (only an exact 100 is), and a tiny real share is
// not "0%".

/** One decimal, 99.9 at most below 100 and 0.1 at least above 0. Null for null or a non-number. */
export const roundPct = (value: number | null | undefined): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  const r = Math.round(value * 10) / 10;
  if (value < 100 && r >= 100) return 99.9;
  if (value > 0 && r <= 0) return 0.1;
  return r;
};

/** "76%", "99.6%", "100%"; `fallback` (default "-") when there is no figure. */
export const formatPct = (value: number | null | undefined, fallback = '-'): string => {
  const r = roundPct(value);
  return r === null ? fallback : `${r}%`;
};
