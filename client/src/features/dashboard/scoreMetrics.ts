import type { Scores } from '../../api/scores';
import { roundPct } from '../../lib/percent';
import { SCORE_LABEL, SCORE_LABEL_SHORT } from '../../lib/scoreLabels';

// The three percentages every module is judged on, and the tab that picks which to look at.
export type SeriesKey = 'completion' | 'compliance' | 'ontime';
export type ScoreMetric = 'overview' | SeriesKey;
export type ModuleKey = 'checklist' | 'ticket' | 'delegation';

export const METRIC_OPTIONS: readonly ScoreMetric[] = ['overview', 'completion', 'compliance', 'ontime'];
// 'overview' is the overall score (completion and compliance counted equally). Its tab says "Overall",
// the short form of the "Overall score" name used everywhere else, because the measure tabs share one
// narrow row of four.
export const METRIC_LABEL: Record<ScoreMetric, string> = { overview: SCORE_LABEL_SHORT.overall, completion: SCORE_LABEL.completion, compliance: SCORE_LABEL.compliance, ontime: SCORE_LABEL_SHORT.onTime };
export const isMetric = (v: unknown): v is ScoreMetric => typeof v === 'string' && (METRIC_OPTIONS as readonly string[]).includes(v);

export const SERIES_LABEL: Record<SeriesKey, string> = { completion: SCORE_LABEL.completion, compliance: SCORE_LABEL.compliance, ontime: SCORE_LABEL.onTime };
// Blue in three weights, so the three read as one family and a colour means the same in every view.
export const SERIES_COLOR: Record<SeriesKey, string> = {
  completion: 'var(--color-primary-500)',
  compliance: 'var(--color-series-compliance)',
  ontime: 'var(--color-primary-400)',
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
  return parts.length ? roundPct(parts.reduce((x, y) => x + y, 0) / parts.length) : null;
};

/**
 * The one Overall score every view uses (Scorecard, Overview leaders, leaderboard, rankings): the
 * completion and compliance of every module that had something due, all counted equally. Null when
 * nothing was due.
 */
export const overallOf = (s: ModuleScores & { overall?: number | null }): number | null => {
  // The server computes this from unrounded figures; when it sends one, that is the number, so no screen
  // can differ from another by re-deriving it.
  if (s.overall !== undefined) return s.overall;
  const values: number[] = [];
  for (const { key } of MODULE_ROWS) {
    const m = s[key];
    if (m.due <= 0) continue;
    if (m.completionPct !== null) values.push(m.completionPct);
    if (m.compliancePct !== null) values.push(m.compliancePct);
  }
  return values.length ? roundPct(values.reduce((a, b) => a + b, 0) / values.length) : null;
};

/**
 * One measure taken across all three modules, weighted by what each module had due, so a module with 2
 * items does not count like one with 200. The Scorecard rows and the Team Overview cards both use this, so
 * the same person never reads two different Completion or On time figures.
 */
export const acrossModules = (s: ModuleScores): { due: number; done: number; onTime: number; late: number; notDone: number; completion: number | null; compliance: number | null; ontime: number | null } => {
  const parts = [
    { due: s.checklist.due, done: s.checklist.completed, onTime: s.checklist.onTime, compliance: s.checklist.compliancePct },
    { due: s.ticket.due, done: s.ticket.closed, onTime: s.ticket.onTime, compliance: s.ticket.compliancePct },
    { due: s.delegation.due, done: s.delegation.done, onTime: s.delegation.onTime, compliance: s.delegation.compliancePct },
  ];
  const due = parts.reduce((t, p) => t + p.due, 0);
  const done = parts.reduce((t, p) => t + p.done, 0);
  const onTime = parts.reduce((t, p) => t + p.onTime, 0);
  const withCompliance = parts.filter((p) => p.compliance !== null && p.due > 0);
  const complianceDue = withCompliance.reduce((t, p) => t + p.due, 0);
  return {
    due,
    done,
    onTime,
    late: Math.max(0, done - onTime),
    notDone: Math.max(0, due - done),
    completion: due ? roundPct((done / due) * 100) : null,
    compliance: complianceDue ? roundPct(withCompliance.reduce((t, p) => t + (p.compliance as number) * p.due, 0) / complianceDue) : null,
    ontime: done ? roundPct((onTime / done) * 100) : null,
  };
};

/** Everything due across the three modules: what the minimum-volume rule for ranking checks. */
export const totalDue = (s: ModuleScores): number => s.checklist.due + s.ticket.due + s.delegation.due;

/** Column heads for a per-module score table, the same words the screens use. */
export const MODULE_EXPORT_HEAD = [SCORE_LABEL.overall, `${SCORE_LABEL.completion} %`, `${SCORE_LABEL.compliance} %`, `${SCORE_LABEL.onTime} %`, 'Due', 'Done', 'Late', 'Not done'] as const;

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
    const waiting = t.waitingOnTime ?? 0;
    const reopened = t.reopened ?? 0;
    const reopenedNote = reopened > 0 ? ` (${reopened} sent back or reopened)` : '';
    return {
      completion: t.completionPct, compliance: t.compliancePct, ontime: t.onTimePct,
      completionNote: waiting > 0 ? `${t.done ?? t.closed} of ${t.due} done (${waiting} waiting for approval)` : `${t.done ?? t.closed} of ${t.due} done`,
      complianceNote: (waiting > 0 ? `${t.onTime + waiting} of ${t.due} handed in on time (${waiting} waiting for approval)` : `${t.onTime} of ${t.due} closed on time`) + reopenedNote,
      ontimeNote: `${t.onTime + waiting} of ${t.done ?? t.closed} finished tickets were on time`,
      hasData: t.due > 0,
    };
  }
  const d = s.delegation;
  const waiting = d.waitingOnTime ?? 0;
  return {
    completion: d.completionPct, compliance: d.compliancePct, ontime: d.onTimePct,
    completionNote: `${d.done} of ${d.due} done`,
    complianceNote: waiting > 0 ? `${d.onTime + waiting} of ${d.due} handed in on time (${waiting} waiting for approval)` : `${d.onTime} of ${d.due} done on time`,
    ontimeNote: `${d.onTime + waiting} of ${d.done} finished delegations were on time`,
    hasData: d.due > 0,
  };
};

/** Fewest items (or checklist runs) due before a person, department or store may be ranked or named a winner. The server's `rankable` flag uses the same number. */
export const MIN_RANK_VOLUME = 5;
