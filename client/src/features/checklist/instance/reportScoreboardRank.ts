import { roundPct } from '../../../lib/percent';

export interface ScoreboardItem {
  id: string;
  name: string;
  due: number;
  missed: number;
  open: number;
  completion: number | null;
  compliance: number | null;
  rankable: boolean;
  completed: number;
}

export type RankedScoreboardItem = ScoreboardItem & { score: number | null };

const scoreOf = (i: Pick<ScoreboardItem, 'completion' | 'compliance'>) => {
  if (i.completion === null) return null;
  return roundPct(i.compliance === null ? i.completion : (i.completion + i.compliance) / 2);
};

type Order = Pick<RankedScoreboardItem, 'score' | 'compliance' | 'completion' | 'due' | 'name'>;

const byRule = (a: Order, b: Order) =>
  (b.score ?? -1) - (a.score ?? -1) ||
  (b.compliance ?? -1) - (a.compliance ?? -1) ||
  (b.completion ?? -1) - (a.completion ?? -1) ||
  b.due - a.due ||
  a.name.localeCompare(b.name);

const sameStanding = (a: RankedScoreboardItem, b: RankedScoreboardItem) =>
  a.score === b.score && a.compliance === b.compliance && a.completion === b.completion && a.due === b.due;

export const rankScoreboard = (items: readonly ScoreboardItem[] | undefined) => {
  const scored: RankedScoreboardItem[] = (items ?? []).map((i) => ({ ...i, score: scoreOf(i) }));
  const live = scored.filter((i) => i.score !== null && i.rankable).sort(byRule);
  const tooFew = scored.filter((i) => i.score !== null && !i.rankable).sort(byRule);
  const idle = scored.filter((i) => i.score === null).sort((a, b) => a.name.localeCompare(b.name));
  const top = live[0];
  const winner = top ? live.filter((i) => sameStanding(i, top)) : [];
  const ranked = [...live, ...tooFew, ...idle];
  const rankOf = (i: RankedScoreboardItem, idx: number) => {
    if (i.score === null || !i.rankable) return null;
    const first = live.findIndex((r) => sameStanding(r, i));
    return (first >= 0 ? first : idx) + 1;
  };
  return { ranked, winner, rankOf };
};
