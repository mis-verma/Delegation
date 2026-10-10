import type { Scores } from '../../api/scores';

// The three percentages every module is judged on, and the tab that picks which to look at.
export type SeriesKey = 'completion' | 'compliance' | 'ontime';
export type ScoreMetric = 'overview' | SeriesKey;
export type ModuleKey = 'checklist' | 'ticket' | 'delegation';

export const METRIC_OPTIONS: readonly ScoreMetric[] = ['overview', 'completion', 'compliance', 'ontime'];
export const METRIC_LABEL: Record<ScoreMetric, string> = { overview: 'Overview', completion: 'Completion', compliance: 'Compliance', ontime: 'On time' };
export const isMetric = (v: unknown): v is ScoreMetric => typeof v === 'string' && (METRIC_OPTIONS as readonly string[]).includes(v);

export const SERIES_LABEL: Record<SeriesKey, string> = { completion: 'Completion', compliance: 'Compliance', ontime: 'On time' };
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
