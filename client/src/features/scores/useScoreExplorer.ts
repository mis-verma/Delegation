import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { scoreApi, type ExplorerParams, type ExplorerResponse } from '../../api/scores';
import { useAuth } from '../../context/AuthContext';
import { SCORE_QUERY_OPTIONS } from '../dashboard/scoreQueries';

/**
 * One cache key from every parameter. It sits under ['scores', ...], so invalidateScoreCaches (every finished,
 * approved or sent-back item) refreshes it with the rest. Two pages that ask for the same view, window and
 * filters share one request and can never show two different answers.
 */
export const scoreExplorerQuery = (p: ExplorerParams) => ({
  queryKey: ['scores', 'explorer', p.from, p.to, p.view, p.storeId ?? '', p.departmentId ?? '', p.module ?? '', p.recurrence ?? 'all', p.parentId ?? ''] as const,
  queryFn: (): Promise<ExplorerResponse> => scoreApi.explorer(p),
  ...SCORE_QUERY_OPTIONS,
});

/**
 * The Score Explorer. While the next window or view loads, the previous answer stays on screen unchanged
 * (no dimming) and `updating` is true, for one plain "Updating" line. Read `data.view` and `data.parent` to
 * know what the rows on screen are, not the view you just asked for.
 */
export const useScoreExplorer = (params: ExplorerParams | null, enabled = true) => {
  const { token } = useAuth();
  const query = useQuery({
    ...scoreExplorerQuery(params ?? { from: '', to: '', view: 'department' }),
    enabled: enabled && !!token && !!params && !!params.from && !!params.to,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
  return { ...query, updating: query.isPlaceholderData };
};
