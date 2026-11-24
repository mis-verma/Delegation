import type { ChecklistInstanceItem } from '../../api/checklistInstances';

/**
 * Points scoring, as an audit means it: what a rating actually scored out of the most it could.
 *
 * This mirrors the server's pointsScore module so a run shows the same percentage before the
 * server has been asked, the way auditScore is mirrored already. The rules are deliberately the
 * same on both sides: only a rating carries points, a waived or not-applicable question carries
 * none at all, and a question left unanswered still counts towards the maximum.
 */

export type PointScorable = Pick<ChecklistInstanceItem, 'itemType' | 'isDone' | 'isNotApplicable' | 'numericValue' | 'ratingScale' | 'floor' | 'section' | 'sectionOwnerId'>
  & { waivedAt?: string | null };

export interface PointsTally {
  earned: number;
  max: number;
  /** Null when nothing here can be scored, which is not the same as scoring zero. */
  pct: number | null;
}

export interface SectionTally extends PointsTally {
  key: string;
  floor: string | null;
  section: string | null;
  sectionOwnerId: string | null;
  scored: number;
  answered: number;
}

export interface FloorTally extends PointsTally {
  floor: string | null;
  sections: SectionTally[];
}

export const pctOf = (earned: number, max: number): number | null =>
  (max > 0 ? Math.round((earned / max) * 1000) / 10 : null);

const scaleOf = (item: PointScorable): number | null => {
  if (item.itemType !== 'RATING') return null;
  if (item.isNotApplicable || item.waivedAt) return null;
  const scale = item.ratingScale ?? 0;
  return scale > 0 ? scale : null;
};

export const itemPoints = (item: PointScorable): PointsTally | null => {
  const max = scaleOf(item);
  if (max === null) return null;
  const earned = Math.min(Math.max(item.isDone ? item.numericValue ?? 0 : 0, 0), max);
  return { earned, max, pct: pctOf(earned, max) };
};

export const totalPoints = (items: readonly PointScorable[]): PointsTally =>
  items.reduce<PointsTally>((sum, item) => {
    const points = itemPoints(item);
    if (!points) return sum;
    const earned = sum.earned + points.earned;
    const max = sum.max + points.max;
    return { earned, max, pct: pctOf(earned, max) };
  }, { earned: 0, max: 0, pct: null });

const groupKey = (floor: string | null | undefined, section: string | null | undefined) => `${floor ?? ''}\u0000${section ?? ''}`;

export const sectionPoints = (items: readonly PointScorable[]): SectionTally[] => {
  const byKey = new Map<string, SectionTally>();
  for (const item of items) {
    const points = itemPoints(item);
    if (!points) continue;
    const key = groupKey(item.floor, item.section);
    const group = byKey.get(key) ?? {
      key,
      floor: item.floor ?? null,
      section: item.section ?? null,
      sectionOwnerId: item.sectionOwnerId ?? null,
      earned: 0, max: 0, pct: null, scored: 0, answered: 0,
    };
    group.earned += points.earned;
    group.max += points.max;
    group.scored += 1;
    if (item.isDone) group.answered += 1;
    group.pct = pctOf(group.earned, group.max);
    byKey.set(key, group);
  }
  return [...byKey.values()];
};

/** Rolls the sections up into their floors, keeping both levels for the report. */
export const floorPoints = (items: readonly PointScorable[]): FloorTally[] => {
  const byFloor = new Map<string, FloorTally>();
  for (const section of sectionPoints(items)) {
    const key = section.floor ?? '';
    const floor = byFloor.get(key) ?? { floor: section.floor, earned: 0, max: 0, pct: null, sections: [] };
    floor.earned += section.earned;
    floor.max += section.max;
    floor.pct = pctOf(floor.earned, floor.max);
    floor.sections.push(section);
    byFloor.set(key, floor);
  }
  return [...byFloor.values()];
};

/** True when this run is judged on points rather than on acceptable answers. */
export const isPointsScored = (run: { scoringMode?: string | null }): boolean => run.scoringMode === 'POINTS';
