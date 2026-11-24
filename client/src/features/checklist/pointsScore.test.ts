import { describe, expect, it } from 'vitest';
import { floorPoints, isPointsScored, itemPoints, pctOf, sectionPoints, totalPoints, type PointScorable } from './pointsScore';

const rating = (over: Partial<PointScorable> = {}): PointScorable => ({
  itemType: 'RATING',
  isDone: true,
  isNotApplicable: false,
  numericValue: 5,
  ratingScale: 5,
  floor: null,
  section: null,
  sectionOwnerId: null,
  ...over,
});

describe('itemPoints', () => {
  it('scores a rating against its own scale', () => {
    expect(itemPoints(rating({ numericValue: 3 }))).toEqual({ earned: 3, max: 5, pct: 60 });
    expect(itemPoints(rating({ numericValue: 7, ratingScale: 10 }))).toEqual({ earned: 7, max: 10, pct: 70 });
  });

  it('counts an unanswered question as nothing earned against its full maximum', () => {
    expect(itemPoints(rating({ isDone: false, numericValue: null }))).toEqual({ earned: 0, max: 5, pct: 0 });
  });

  it('leaves out anything that cannot carry points', () => {
    expect(itemPoints(rating({ itemType: 'YES_NO' }))).toBeNull();
    expect(itemPoints(rating({ isNotApplicable: true }))).toBeNull();
    expect(itemPoints(rating({ waivedAt: '2026-11-24T00:00:00.000Z' }))).toBeNull();
    expect(itemPoints(rating({ ratingScale: null }))).toBeNull();
  });

  it('holds a stored value inside its own scale', () => {
    expect(itemPoints(rating({ numericValue: 9 }))?.earned).toBe(5);
    expect(itemPoints(rating({ numericValue: -2 }))?.earned).toBe(0);
  });
});

describe('pctOf', () => {
  it('keeps one decimal, and says nothing when nothing is on offer', () => {
    expect(pctOf(1, 3)).toBe(33.3);
    expect(pctOf(2, 3)).toBe(66.7);
    expect(pctOf(0, 0)).toBeNull();
  });
});

describe('totalPoints', () => {
  it('adds the whole audit up', () => {
    expect(totalPoints([rating({ numericValue: 3 }), rating({ numericValue: 5 }), rating({ numericValue: 4 })]))
      .toEqual({ earned: 12, max: 15, pct: 80 });
  });

  it('is null rather than zero when nothing can be scored', () => {
    expect(totalPoints([rating({ itemType: 'STANDARD' })])).toEqual({ earned: 0, max: 0, pct: null });
  });
});

describe('sectionPoints and floorPoints', () => {
  const items = [
    rating({ floor: 'Floor 1', section: 'Washrooms', sectionOwnerId: 'u1', numericValue: 3 }),
    rating({ floor: 'Floor 1', section: 'Washrooms', sectionOwnerId: 'u1', numericValue: 5 }),
    rating({ floor: 'Floor 1', section: 'Corridors', sectionOwnerId: 'u2', numericValue: 4 }),
    rating({ floor: 'Floor 2', section: 'Lobby', sectionOwnerId: 'u3', numericValue: 2, isDone: false }),
  ];

  it('tallies each section and keeps who answers for it', () => {
    const sections = sectionPoints(items);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toMatchObject({ section: 'Washrooms', sectionOwnerId: 'u1', earned: 8, max: 10, pct: 80, answered: 2 });
    expect(sections[2]).toMatchObject({ section: 'Lobby', earned: 0, max: 5, pct: 0, answered: 0 });
  });

  it('keeps two sections of the same name apart on different floors', () => {
    const sections = sectionPoints([
      rating({ floor: 'Floor 1', section: 'Washrooms', numericValue: 5 }),
      rating({ floor: 'Floor 2', section: 'Washrooms', numericValue: 1 }),
    ]);
    expect(sections.map((s) => s.pct)).toEqual([100, 20]);
  });

  it('rolls sections into floors, and the floors agree with the total', () => {
    const floors = floorPoints(items);
    expect(floors[0]).toMatchObject({ floor: 'Floor 1', earned: 12, max: 15, pct: 80 });
    expect(floors[1]).toMatchObject({ floor: 'Floor 2', earned: 0, max: 5, pct: 0 });
    const earned = floors.reduce((n, f) => n + f.earned, 0);
    const max = floors.reduce((n, f) => n + f.max, 0);
    expect({ earned, max }).toEqual({ earned: totalPoints(items).earned, max: totalPoints(items).max });
    expect(totalPoints(items).pct).toBe(60);
  });
});

describe('isPointsScored', () => {
  it('only says yes for a points run', () => {
    expect(isPointsScored({ scoringMode: 'POINTS' })).toBe(true);
    expect(isPointsScored({ scoringMode: 'RULE' })).toBe(false);
    expect(isPointsScored({})).toBe(false);
  });
});
