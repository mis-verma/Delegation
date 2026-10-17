import { createContext, useMemo } from 'react';
import type { ExplorerRow, ExplorerView } from '../../../api/scores';
import { useOrgToday } from '../../checklist/useOrgToday';
import { useScoreExplorer } from '../../scores/useScoreExplorer';

export type ScoreKind = 'department' | 'store' | 'person';

// What a row opens to on the Scores page: a department's people, a store's departments, a person's checklists.
const NEXT_VIEW: Record<ScoreKind, ExplorerView> = { department: 'person', store: 'department', person: 'checklist' };

/**
 * Month-to-date scores for every department, store or person, in one request. The same Score Explorer call
 * (and cache) the Scores page makes, so the number on a card is the number the Scores page shows.
 * `byId` stays undefined until the answer arrives, so a card never shows "nothing due" while it is loading.
 */
export const useMonthScores = (view: ScoreKind) => {
  const today = useOrgToday();
  const from = `${today.slice(0, 8)}01`;
  const query = useScoreExplorer({ from, to: today, view });
  const rows = query.data?.rows;
  const byId = useMemo(() => (rows ? new Map(rows.map((r) => [r.id, r])) : undefined), [rows]);
  return { byId, failed: query.isError && !rows, from, to: today };
};

/** The Scores page opened on this department, store or person, for the same month-to-date window. */
export const scoresHref = (kind: ScoreKind, id: string, name: string, from: string, to: string) => {
  const params = new URLSearchParams({ from, to, view: NEXT_VIEW[kind], trail: JSON.stringify([{ id, kind, name }]) });
  return `/admin/scores?${params.toString()}`;
};

export interface OrgScores {
  department: Map<string, ExplorerRow> | undefined;
  store: Map<string, ExplorerRow> | undefined;
  person: Map<string, ExplorerRow> | undefined;
  from: string;
  to: string;
}

/** Month-to-date scores for the whole Org structure tree, read by each branch without threading props through the memoised rows. */
export const OrgScoresContext = createContext<OrgScores | null>(null);

/** All three cuts at once, for the Org structure tab. */
export const useAllMonthScores = (): OrgScores => {
  const department = useMonthScores('department');
  const store = useMonthScores('store');
  const person = useMonthScores('person');
  return useMemo(
    () => ({ department: department.byId, store: store.byId, person: person.byId, from: department.from, to: department.to }),
    [department.byId, store.byId, person.byId, department.from, department.to],
  );
};
