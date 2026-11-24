/**
 * Points scoring, as an audit means it: what a rating actually scored out of the most it could.
 *
 * RULE scoring asks whether an answer is acceptable, which is all a yes/no question can say.
 * An audit needs the distance as well, so a three out of five is worth three, not simply "bad".
 * Everything here is pure, so the same arithmetic can run on a stored run, on a preview, or in
 * a test, without a database.
 */

export interface PointScorable {
    itemType: string;
    isDone: boolean;
    isNotApplicable: boolean;
    waivedAt?: Date | string | null;
    numericValue?: number | null;
    ratingScale?: number | null;
    floor?: string | null;
    section?: string | null;
    sectionOwnerId?: string | null;
}

export interface PointsTally {
    earned: number;
    max: number;
    /** Null when nothing in this group can be scored, which is not the same as scoring zero. */
    pct: number | null;
}

export interface GroupTally extends PointsTally {
    key: string;
    floor: string | null;
    section: string | null;
    sectionOwnerId: string | null;
    scored: number;
    answered: number;
}

/** Only a rating carries points, and only when its scale says how many are on offer. */
const scaleOf = (item: PointScorable): number | null => {
    if (item.itemType !== 'RATING') return null;
    if (item.isNotApplicable || item.waivedAt) return null;
    const scale = item.ratingScale ?? 0;
    return scale > 0 ? scale : null;
};

/**
 * What one question contributed. An unanswered question still counts towards the maximum,
 * because the audit was asked for and the points were not earned.
 */
export const itemPoints = (item: PointScorable): PointsTally | null => {
    const max = scaleOf(item);
    if (max === null) return null;
    const value = item.isDone ? item.numericValue ?? 0 : 0;
    const earned = Math.min(Math.max(value, 0), max);
    return { earned, max, pct: pctOf(earned, max) };
};

export const pctOf = (earned: number, max: number): number | null =>
    max > 0 ? Math.round((earned / max) * 1000) / 10 : null;

const add = (a: PointsTally, b: PointsTally): PointsTally => {
    const earned = a.earned + b.earned;
    const max = a.max + b.max;
    return { earned, max, pct: pctOf(earned, max) };
};

const EMPTY: PointsTally = { earned: 0, max: 0, pct: null };

export const totalPoints = (items: readonly PointScorable[]): PointsTally =>
    items.reduce<PointsTally>((sum, item) => {
        const points = itemPoints(item);
        return points ? add(sum, points) : sum;
    }, EMPTY);

export const groupKey = (floor: string | null | undefined, section: string | null | undefined): string =>
    `${floor ?? ''}\u0000${section ?? ''}`;

/**
 * One tally per floor and section, in the order the questions appear, so a report reads the way
 * the auditor walked the building.
 */
export const sectionPoints = (items: readonly PointScorable[]): GroupTally[] => {
    const byKey = new Map<string, GroupTally>();
    for (const item of items) {
        const points = itemPoints(item);
        if (!points) continue;
        const key = groupKey(item.floor, item.section);
        const group = byKey.get(key) ?? {
            key,
            floor: item.floor ?? null,
            section: item.section ?? null,
            sectionOwnerId: item.sectionOwnerId ?? null,
            earned: 0,
            max: 0,
            pct: null,
            scored: 0,
            answered: 0,
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

export interface FloorTally extends PointsTally {
    floor: string | null;
    sections: GroupTally[];
}

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
