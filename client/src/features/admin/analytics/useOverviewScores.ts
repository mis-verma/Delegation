import { useMemo } from 'react';
import { toDayParam } from '../../../api/checklistInstances';
import type { ExplorerView } from '../../../api/scores';
import { useOrgToday } from '../../checklist/useOrgToday';
import { capWindowAtToday, windowLabel } from '../../scores/useScoreWindow';
import { useScoreExplorer } from '../../scores/useScoreExplorer';

/**
 * The Overview's period bar (ISO instants from useAnalyticsWindow) as the org days the score explorer takes,
 * never later than today. Null until the page has a window.
 */
export const useOverviewScoreWindow = (windowFrom?: string, windowTo?: string) => {
  const today = useOrgToday();
  return useMemo(() => {
    if (!windowFrom || !windowTo) return null;
    const capped = capWindowAtToday(toDayParam(windowFrom), toDayParam(windowTo), today);
    return { from: capped.from, to: capped.to, label: windowLabel(capped.from, capped.to) };
  }, [windowFrom, windowTo, today]);
};

interface OverviewScoresOptions {
  view?: ExplorerView;
  /** Narrows the explorer to one store (the Compliance Board store filter). */
  storeId?: string;
  enabled?: boolean;
}

/**
 * Every score-type number on the Overview comes from here: the explorer answer for the Overview's window.
 * Same params as the Scores page, so the two share one cache entry and cannot disagree. `total` is the
 * whole-window row (everything counted once); `updating` is true while the next window is loading and the
 * old numbers are still on screen.
 */
export const useOverviewScores = (windowFrom?: string, windowTo?: string, { view = 'department', storeId, enabled = true }: OverviewScoresOptions = {}) => {
  const win = useOverviewScoreWindow(windowFrom, windowTo);
  const query = useScoreExplorer(win ? { from: win.from, to: win.to, view, ...(storeId ? { storeId } : {}) } : null, enabled);
  return { ...query, win, total: query.data?.total ?? null };
};
