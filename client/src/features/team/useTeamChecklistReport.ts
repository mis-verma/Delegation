import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { checklistReportApi } from '../../api/checklistReports';
import { taskApi } from '../../api/task';
import { handleQueryRetry } from '../../lib/queryHelpers';
import type { TeamPeriodRange } from './teamDisplay';

// One request for the whole Team Overview page: every person and every department that had a
// store checklist run in the period. Kept on screen while a new period loads (the page dims it),
// so changing the period never flashes the grid back to skeletons.
export const useTeamChecklistReport = (range: Pick<TeamPeriodRange, 'from' | 'to'>) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-report', 'team', range.from, range.to] as const,
    queryFn: () => checklistReportApi.preview({ from: range.from, to: range.to, groupBy: 'both' }),
    enabled: !!token,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
};

export interface TeamTaskChecklistTotals {
  totalItems: number;
  doneItems: number;
  photoItems: number;
  photoOk: number;
  /** Required evidence photos uploaded, as a whole %; null when no item needed a photo. */
  photoRate: number | null;
}

// Delegation checklist items (the to-do items inside tasks) and their photo-evidence rate for one
// person over the selected window. Fetched as one 'year' bucket per calendar year the window
// touches (at most two) and summed, so it covers exactly the chosen period instead of whichever
// bucket "now" falls in.
export const useTeamTaskChecklistTotals = (range: Pick<TeamPeriodRange, 'startMs' | 'endMs'>, departmentId: string, personId: string) => {
  const { token } = useAuth();
  const from = new Date(range.startMs).toISOString();
  const to = new Date(range.endMs).toISOString();
  return useQuery({
    queryKey: ['tasks', 'compliance', 'team-window', from, to, departmentId, personId] as const,
    queryFn: () => taskApi.getComplianceReport('year', from, to, departmentId, personId).then((r) => r.data),
    select: (rows): TeamTaskChecklistTotals => {
      let totalItems = 0;
      let doneItems = 0;
      let photoItems = 0;
      let photoOk = 0;
      for (const row of rows) {
        totalItems += row.totalItems;
        doneItems += row.doneItems;
        photoItems += row.itemsRequiringPhotos;
        photoOk += Math.round(((row.qualityRate ?? 0) / 100) * row.itemsRequiringPhotos);
      }
      return { totalItems, doneItems, photoItems, photoOk, photoRate: photoItems > 0 ? Math.round((photoOk / photoItems) * 100) : null };
    },
    enabled: !!token,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
};
