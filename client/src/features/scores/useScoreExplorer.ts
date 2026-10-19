import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { scoreApi, type ExplorerParams, type ExplorerResponse } from '../../api/scores';
import { useAuth } from '../../context/AuthContext';
import { SCORE_QUERY_OPTIONS } from '../dashboard/scoreQueries';

export const scoreExplorerQuery = (p: ExplorerParams) => ({
  queryKey: ['scores', 'explorer', p.from, p.to, p.view, p.storeId ?? '', p.departmentId ?? '', p.module ?? '', p.recurrence ?? 'all', p.parentId ?? ''] as const,
  queryFn: (): Promise<ExplorerResponse> => scoreApi.explorer(p),
  ...SCORE_QUERY_OPTIONS,
});

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
