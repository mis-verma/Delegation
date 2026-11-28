
export const roundPct = (value: number | null | undefined): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  const r = Math.round(value * 10) / 10;
  if (value < 100 && r >= 100) return 99.9;
  if (value > 0 && r <= 0) return 0.1;
  return r;
};

// One decimal, always, so a column or ring of scores lines up (80.0% beside 82.5%).
export const pctDigits = (value: number | null | undefined): string | null => {
  const r = roundPct(value);
  return r === null ? null : r.toFixed(1);
};

export const formatPctFixed = (value: number | null | undefined, fallback = '-'): string => {
  const d = pctDigits(value);
  return d === null ? fallback : `${d}%`;
};

export const formatPct = (value: number | null | undefined, fallback = '-'): string => {
  const r = roundPct(value);
  return r === null ? fallback : `${r}%`;
};

// Whole-number percentages for checklist figures. Keeps 100% and 0% for their exact values only.
export const wholePct = (value: number | null | undefined): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  const r = Math.round(value);
  if (value < 100 && r >= 100) return 99;
  if (value > 0 && r <= 0) return 1;
  return r;
};

export const formatWholePct = (value: number | null | undefined, fallback = '-'): string => {
  const r = wholePct(value);
  return r === null ? fallback : `${r}%`;
};
