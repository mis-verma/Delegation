import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { scoreApi, type MatrixParams } from '../../../../api/scores';
import { useAuth } from '../../../../context/AuthContext';
import { SCORE_QUERY_OPTIONS } from '../../../dashboard/scoreQueries';

export const useBiMatrix = (params: MatrixParams | null) => {
  const { token } = useAuth();
  const p = params ?? { from: '', to: '', view: 'department' as const, period: 'day' as const };
  const query = useQuery({
    queryKey: ['scores', 'matrix', p.from, p.to, p.view, p.period, p.storeId ?? '', p.departmentId ?? '', p.parentId ?? ''] as const,
    queryFn: () => scoreApi.matrix(p),
    ...SCORE_QUERY_OPTIONS,
    enabled: !!token && !!params && !!p.from && !!p.to,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
  return { ...query, updating: query.isPlaceholderData };
};
