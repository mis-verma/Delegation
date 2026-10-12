import type { Scores } from '../../api/scores';

// The three percentages every module is judged on, and the tab that picks which to look at.
export type SeriesKey = 'completion' | 'compliance' | 'ontime';
export type ScoreMetric = 'overview' | SeriesKey;
export type ModuleKey = 'checklist' | 'ticket' | 'delegation';

export const METRIC_OPTIONS: readonly ScoreMetric[] = ['overview', 'completion', 'compliance', 'ontime'];
// 'overview' is the overall score (completion and compliance counted equally). Its tab says "Overall",
// the short form of the "Overall score" name used everywhere else, because the measure tabs share one
// narrow row of four.
export const METRIC_LABEL: Record<ScoreMetric, string> = { overview: 'Overall', completion: 'Completion', compliance: 'Compliance', ontime: 'On time' };
export const isMetric = (v: unknown): v is ScoreMetric => typeof v === 'string' && (METRIC_OPTIONS as readonly string[]).includes(v);

export const SERIES_LABEL: Record<SeriesKey, string> = { completion: 'Completion', compliance: 'Compliance', ontime: 'On time' };
/** Plain words for the phone legend, where there is no hint to explain "completion" and "compliance". */
export const SERIES_PHONE_LABEL: Record<SeriesKey, string> = { completion: 'Done', compliance: 'On time or right', ontime: 'On time' };
// Blue in three weights, so the three read as one family and a colour means the same in every view.
export const SERIES_COLOR: Record<SeriesKey, string> = {
  completion: 'var(--color-primary-500)',
  compliance: 'var(--color-series-compliance)',
  ontime: 'var(--color-primary-400)',
};
export const SERIES_HELP: Record<SeriesKey, string> = {
  completion: 'Done, out of what was due',
  compliance: 'Done on time out of what was due. For checklists, how well the checked answers were answered',
  ontime: 'Of the items that were finished, the share finished on time',
};

/** Overview shows completion beside compliance; every other tab shows one measure on its own. */
export const seriesFor = (metric: ScoreMetric): SeriesKey[] => (metric === 'overview' ? ['completion', 'compliance'] : [metric]);

interface ModuleNumbers {
  completion: number | null;
  compliance: number | null;
  ontime: number | null;
  completionNote: string;
  complianceNote: string;
  ontimeNote: string;
  hasData: boolean;
}

export const MODULE_ROWS: readonly { key: ModuleKey; label: string }[] = [
  { key: 'checklist', label: 'Checklist' },
  { key: 'ticket', label: 'Tickets' },
  { key: 'delegation', label: 'Delegations' },
];

type ModuleScores = Pick<Scores, ModuleKey>;

/**
 * One module's counts in the words every score view uses: Done, Late (finished, but after the
 * deadline) and Not done. Late and Not done never count the same item twice, so for tickets an open
 * ticket is "not done", never also "late".
 */
export const moduleCounts = (s: ModuleScores, key: ModuleKey): { due: number; done: number; onTime: number; late: number; notDone: number } => {
  if (key === 'checklist') {
    const c = s.checklist;
    return { due: c.due, done: c.completed, onTime: c.onTime, late: Math.max(0, c.completed - c.onTime), notDone: c.missed };
  }
  if (key === 'ticket') {
    const t = s.ticket;
    return { due: t.due, done: t.closed, onTime: t.onTime, late: t.late, notDone: Math.max(0, t.due - t.closed) };
  }
  const d = s.delegation;
  return { due: d.due, done: d.done, onTime: d.onTime, late: Math.max(0, d.done - d.onTime), notDone: d.overdue };
};

/** A module's Overall score: completion and compliance counted equally. Null when nothing was due. */
export const moduleOverall = (s: ModuleScores, key: ModuleKey): number | null => {
  const m = s[key];
  if (m.due === 0) return null;
  const parts = [m.completionPct, m.compliancePct].filter((v): v is number => v !== null);
  return parts.length ? Math.round(parts.reduce((x, y) => x + y, 0) / parts.length) : null;
};

/** Column heads for a per-module score table, the same words the screens use. */
export const MODULE_EXPORT_HEAD = ['Overall score', 'Completion %', 'Compliance %', 'On time %', 'Due', 'Done', 'Late', 'Not done'] as const;

/** One module's cells under MODULE_EXPORT_HEAD: numbers only, empty where there is no figure. */
export const moduleExportCells = (s: ModuleScores, key: ModuleKey): (number | null)[] => {
  const m = s[key];
  const n = moduleCounts(s, key);
  return [moduleOverall(s, key), m.completionPct, m.compliancePct, m.onTimePct, n.due, n.done, n.late, n.notDone];
};

/** One module's three percentages with the counts behind them, in words. */
export const numbersFor = (s: Scores, key: ModuleKey): ModuleNumbers => {
  if (key === 'checklist') {
    const c = s.checklist;
    return {
      completion: c.completionPct, compliance: c.compliancePct, ontime: c.onTimePct,
      completionNote: `${c.completed} of ${c.due} runs finished`,
      complianceNote: c.compliancePct === null ? 'No answers checked yet' : 'Checked answers that passed',
      ontimeNote: `${c.onTime} of ${c.completed} finished runs were on time`,
      hasData: c.due > 0,
    };
  }
  if (key === 'ticket') {
    const t = s.ticket;
    return {
      completion: t.completionPct, compliance: t.compliancePct, ontime: t.onTimePct,
      completionNote: `${t.closed} of ${t.due} closed`,
      complianceNote: `${t.onTime} of ${t.due} closed on time`,
      ontimeNote: `${t.onTime} of ${t.closed} closed tickets were on time`,
      hasData: t.due > 0,
    };
  }
  const d = s.delegation;
  return {
    completion: d.completionPct, compliance: d.compliancePct, ontime: d.onTimePct,
    completionNote: `${d.done} of ${d.due} done`,
    complianceNote: `${d.onTime} of ${d.due} done on time`,
    ontimeNote: `${d.onTime} of ${d.done} finished delegations were on time`,
    hasData: d.due > 0,
  };
};
