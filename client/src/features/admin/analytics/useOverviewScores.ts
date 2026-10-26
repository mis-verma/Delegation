import { useMemo } from 'react';
import { toDayParam } from '../../../api/checklistInstances';
import type { ExplorerView } from '../../../api/scores';
import { useAuth } from '../../../context/AuthContext';
import { useOrgToday } from '../../checklist/useOrgToday';
import { capWindowAtToday, windowLabel } from '../../scores/useScoreWindow';
import { useScoreExplorer } from '../../scores/useScoreExplorer';
import { teamScoreView } from '../../scores/teamScoreView';

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
  storeId?: string;
  enabled?: boolean;
}

export const useOverviewScores = (windowFrom?: string, windowTo?: string, { view, storeId, enabled = true }: OverviewScoresOptions = {}) => {
  const { user } = useAuth();
  const win = useOverviewScoreWindow(windowFrom, windowTo);
  const resolvedView = view ?? teamScoreView(user?.role);
  const query = useScoreExplorer(win ? { from: win.from, to: win.to, view: resolvedView, ...(storeId ? { storeId } : {}) } : null, enabled);
  return { ...query, win, total: query.data?.total ?? null };
};
