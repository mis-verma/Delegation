import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ExplorerParams, Scores, ScoreScope } from '../../api/scores';
import { useAuth } from '../../context/AuthContext';
import { scoreQuery } from '../dashboard/scoreQueries';
import { explorerRowToScores } from './explorerAdapters';
import { useScoreExplorer } from './useScoreExplorer';

/**
 * Which explorer request holds the card of this scope, or null when the viewer cannot open the explorer
 * (everyone but Admin, PC and department heads). The organisation is the total row of the department view,
 * a department is a row of it, a store is a row of the store view (Admin and PC), a person is a row of the
 * people view. Rows and totals come from the same answer the Scorecard reads, so the numbers are the same.
 */
export const explorerParamsFor = (role: string | undefined, scope: ScoreScope, from: string, to: string): ExplorerParams | null => {
  const orgWide = role === 'ADMIN' || role === 'PC';
  const head = role === 'MANAGER' || role === 'SENIOR';
  if (!orgWide && !head) return null;
  if (scope === 'org') return orgWide ? { from, to, view: 'department' } : null;
  if (scope === 'store') return orgWide ? { from, to, view: 'store' } : null;
  return { from, to, view: scope === 'department' ? 'department' : 'person' };
};

/**
 * One score card (person, department, store or organisation) for a window. Admin, PC and heads read it from the
 * Score Explorer so it equals the Scorecard and Scores pages for the same window. When the explorer does not hold
 * the subject (a person outside a head's department, a store with no work, or the explorer refusing), and for
 * everyone else, it falls back to the /scores call, which the server keeps equal to the explorer row.
 */
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
    // Keep the last numbers on screen while the next window loads, but only for the same subject, so
    // switching person, department or store never shows one under another's name.
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
