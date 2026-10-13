// Plain functions for ReportScoreboard, kept out of the component file so Fast Refresh keeps working.
// The page's Export uses the same ranking, so the file and the scoreboard always agree.
import { roundPct } from '../../../lib/percent';

export interface ScoreboardItem {
  id: string;
  name: string;
  due: number;
  missed: number;
  open: number;
  completion: number | null;
  compliance: number | null;
  /** Server flag: at least 5 runs were due. Only rankable groups can rank first or win. */
  rankable: boolean;
  /** Runs filled, on time or late. */
  completed: number;
}

export type RankedScoreboardItem = ScoreboardItem & { score: number | null };

/**
 * The Checklist score is the two checklist measures, completion and compliance, counted equally and
 * averaged before any rounding. With no checked answers yet, completion stands alone, so a store is not
 * punished for having nothing to check. It says nothing about tickets or delegations: the all-module
 * "Overall score" lives on the Scorecard.
 */
const scoreOf = (i: Pick<ScoreboardItem, 'completion' | 'compliance'>) => {
  if (i.completion === null) return null;
  return roundPct(i.compliance === null ? i.completion : (i.completion + i.compliance) / 2);
};

type Order = Pick<RankedScoreboardItem, 'score' | 'compliance' | 'completion' | 'due' | 'name'>;

/** Best first: score, then compliance, then completion, then more runs, then name. */
const byRule = (a: Order, b: Order) =>
  (b.score ?? -1) - (a.score ?? -1) ||
  (b.compliance ?? -1) - (a.compliance ?? -1) ||
  (b.completion ?? -1) - (a.completion ?? -1) ||
  b.due - a.due ||
  a.name.localeCompare(b.name);

const sameStanding = (a: RankedScoreboardItem, b: RankedScoreboardItem) =>
  a.score === b.score && a.compliance === b.compliance && a.completion === b.completion && a.due === b.due;

/**
 * Only groups with enough due runs (`rankable`) are ranked and can win. The rest follow below, best first,
 * with no rank and a "Too few runs" note. A group with nothing to score is last. Groups level on every
 * tie-break (score, compliance, completion and run count) share a rank and the win.
 */
export const rankScoreboard = (items: readonly ScoreboardItem[] | undefined) => {
  const scored: RankedScoreboardItem[] = (items ?? []).map((i) => ({ ...i, score: scoreOf(i) }));
  const live = scored.filter((i) => i.score !== null && i.rankable).sort(byRule);
  const tooFew = scored.filter((i) => i.score !== null && !i.rankable).sort(byRule);
  const idle = scored.filter((i) => i.score === null).sort((a, b) => a.name.localeCompare(b.name));
  const top = live[0];
  const winner = top ? live.filter((i) => sameStanding(i, top)) : [];
  const ranked = [...live, ...tooFew, ...idle];
  // Level groups share a rank; only rankable groups have one.
  const rankOf = (i: RankedScoreboardItem, idx: number) => {
    if (i.score === null || !i.rankable) return null;
    const first = live.findIndex((r) => sameStanding(r, i));
    return (first >= 0 ? first : idx) + 1;
  };
  return { ranked, winner, rankOf };
};
