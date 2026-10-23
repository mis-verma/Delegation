import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ExplorerParams, Scores, ScoreScope } from '../../api/scores';
import { useAuth } from '../../context/AuthContext';
import { scoreQuery } from '../dashboard/scoreQueries';
import { explorerRowToScores } from './explorerAdapters';
import { useScoreExplorer } from './useScoreExplorer';

export const explorerParamsFor = (role: string | undefined, scope: ScoreScope, from: string, to: string): ExplorerParams | null => {
  const orgWide = role === 'ADMIN' || role === 'PC' || role === 'OWNER';
  const head = role === 'MANAGER' || role === 'SENIOR';
  if (!orgWide && !head) return null;
  if (scope === 'org') return orgWide ? { from, to, view: 'department' } : null;
  if (scope === 'store') return orgWide ? { from, to, view: 'store' } : null;
  return { from, to, view: scope === 'department' ? 'department' : 'person' };
};

export const useScopeScores = ({ scope, id, from, to, enabled }: { scope: ScoreScope; id: string | undefined; from: string; to: string; enabled: boolean }) => {
  const { user } = useAuth();
  const params = explorerParamsFor(user?.role, scope, from, to);
  const explorer = useScoreExplorer(params, enabled && !!params);
  const answer = params && explorer.data && explorer.data.view === params.view ? explorer.data : undefined;
  const subjectId = scope === 'person' ? id ?? user?.id : id;
  const row = answer ? (scope === 'org' ? answer.total : answer.rows.find((r) => r.id === subjectId)) : undefined;
  const fromExplorer = useMemo(() => (answer && row ? explorerRowToScores(row, scope, answer.window) : undefined), [answer, row, scope]);

  const needLegacy = enabled && (!params || explorer.isError || (!!answer && !row && !explorer.updating));
  const legacy = useQuery<Scores>({
    ...scoreQuery(scope, id, from, to),
    enabled: needLegacy,
    placeholderData: (previous: Scores | undefined) => (previous && previous.scope === scope && (!id || previous.id === id) ? previous : undefined),
  });

  const data = fromExplorer ?? (needLegacy ? legacy.data : undefined);
  const exploring = !!params && enabled && explorer.isFetching && !explorer.isError;
  return {
    data,
    isPending: !data && (exploring || (needLegacy && legacy.isPending)),
    isError: !data && needLegacy && legacy.isError,
    isPlaceholderData: fromExplorer ? explorer.updating : needLegacy && legacy.isPlaceholderData,
    refetch: () => (needLegacy ? legacy.refetch() : explorer.refetch()),
  };
};
