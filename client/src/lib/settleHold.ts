export const SETTLE_MS = 450;

export const MAX_HOLD_MS = 4_000;

export const shouldKeepHolding = (startedAt: number, now: number, held: boolean): boolean =>
  held && now - startedAt < MAX_HOLD_MS;
