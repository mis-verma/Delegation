// Plain functions for ReportScoreboard, kept out of the component file so Fast Refresh keeps working.
// The page's Export uses the same ranking, so the file and the scoreboard always agree.

export interface ScoreboardItem {
  id: string;
  name: string;
  due: number;
  missed: number;
  open: number;
  completion: number | null;
  compliance: number | null;
}

export type RankedScoreboardItem = ScoreboardItem & { score: number | null };

/**
 * The score is the two measures that matter, completion and compliance, counted equally. With no checked
 * answers yet, completion stands alone, so a store is not punished for having nothing to check.
 */
const scoreOf = (i: Pick<ScoreboardItem, 'completion' | 'compliance'>) => {
  if (i.completion === null) return null;
  return i.compliance === null ? i.completion : Math.round((i.completion + i.compliance) / 2);
};

/** Best first: score, then compliance, then completion. Groups with nothing due go to the bottom, unranked. */
export const rankScoreboard = (items: readonly ScoreboardItem[] | undefined) => {
  const scored: RankedScoreboardItem[] = (items ?? []).map((i) => ({ ...i, score: scoreOf(i) }));
  const live = scored.filter((i) => i.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.compliance ?? -1) - (a.compliance ?? -1) || (b.completion ?? -1) - (a.completion ?? -1) || a.name.localeCompare(b.name));
  const idle = scored.filter((i) => i.score === null).sort((a, b) => a.name.localeCompare(b.name));
  // Everyone level on the top score shares the win.
  const top = live[0];
  const winner = top ? live.filter((i) => i.score === top.score && i.compliance === top.compliance && i.completion === top.completion) : [];
  const ranked = [...live, ...idle];
  // Level groups share a rank; groups with nothing due have none.
  const rankOf = (i: RankedScoreboardItem, idx: number) => (i.score === null ? null : ranked.findIndex((r) => r.score === i.score && r.compliance === i.compliance && r.completion === i.completion) + 1 || idx + 1);
  return { ranked, winner, rankOf };
};
