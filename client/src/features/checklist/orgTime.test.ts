import { afterEach, describe, expect, it } from 'vitest';
import { ORG_TZ_OFFSET_MS, orgDayKey, setOrgTzOffsetMinutes } from './orgTime';

const INDIA_MINUTES = 330;

afterEach(() => setOrgTzOffsetMinutes(INDIA_MINUTES));

describe('org timezone offset', () => {
  it('starts on India time', () => {
    expect(ORG_TZ_OFFSET_MS).toBe(INDIA_MINUTES * 60_000);
  });

  it('puts late evening UTC on the next org day', () => {
    expect(orgDayKey(Date.parse('2026-03-01T20:00:00Z'))).toBe('2026-03-02');
    expect(orgDayKey(Date.parse('2026-03-01T17:00:00Z'))).toBe('2026-03-01');
  });

  it('follows the server when it reports another timezone', () => {
    setOrgTzOffsetMinutes(0);
    expect(orgDayKey(Date.parse('2026-03-01T20:00:00Z'))).toBe('2026-03-01');
    setOrgTzOffsetMinutes(-300);
    expect(orgDayKey(Date.parse('2026-03-01T02:00:00Z'))).toBe('2026-02-28');
  });

  it('ignores a value that cannot be a real timezone', () => {
    setOrgTzOffsetMinutes(99_999);
    expect(ORG_TZ_OFFSET_MS).toBe(INDIA_MINUTES * 60_000);
    setOrgTzOffsetMinutes(undefined);
    expect(ORG_TZ_OFFSET_MS).toBe(INDIA_MINUTES * 60_000);
    setOrgTzOffsetMinutes(Number.NaN);
    expect(ORG_TZ_OFFSET_MS).toBe(INDIA_MINUTES * 60_000);
  });
});
