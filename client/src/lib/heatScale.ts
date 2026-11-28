import type { CSSProperties } from 'react';
import { FAIR_FROM, GOOD_FROM } from './scoreBands';
import { formatPctFixed, pctDigits } from './percent';

export const HIGH_FROM = 95;

export type HeatLevel = 'low' | 'fair' | 'good' | 'high';

export const heatLevel = (value: number): HeatLevel => {
  if (value >= HIGH_FROM) return 'high';
  if (value >= GOOD_FROM) return 'good';
  if (value >= FAIR_FROM) return 'fair';
  return 'low';
};

export const heatLook = (value: number | null): CSSProperties | undefined => {
  if (value === null) return undefined;
  const level = heatLevel(value);
  return { background: `var(--heat-${level})`, color: `var(--heat-${level}-ink)` };
};

export const heatFill = (level: HeatLevel): string => `var(--heat-${level})`;

// Same one-decimal figure as every other score on screen, so a heat cell never disagrees with its tile.
export const heatLabel = (value: number): string => pctDigits(value) ?? '-';

export const heatExact = (value: number): string => formatPctFixed(value);

export const HEAT_KEY: readonly { level: HeatLevel; label: string }[] = [
  { level: 'low', label: `Under ${FAIR_FROM}` },
  { level: 'fair', label: `${FAIR_FROM} to ${GOOD_FROM - 1}` },
  { level: 'good', label: `${GOOD_FROM} to ${HIGH_FROM - 1}` },
  { level: 'high', label: `${HIGH_FROM}+` },
];
