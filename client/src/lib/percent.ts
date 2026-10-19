
export const roundPct = (value: number | null | undefined): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  const r = Math.round(value * 10) / 10;
  if (value < 100 && r >= 100) return 99.9;
  if (value > 0 && r <= 0) return 0.1;
  return r;
};

export const formatPct = (value: number | null | undefined, fallback = '-'): string => {
  const r = roundPct(value);
  return r === null ? fallback : `${r}%`;
};
