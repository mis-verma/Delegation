import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { checklistReportApi } from '../../api/checklistReports';
import { taskApi } from '../../api/task';
import { handleQueryRetry } from '../../lib/queryHelpers';
import type { TeamPeriodRange } from './teamDisplay';

export const useTeamChecklistReport = (range: Pick<TeamPeriodRange, 'from' | 'to'>, enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-report', 'team', range.from, range.to] as const,
    queryFn: () => checklistReportApi.preview({ from: range.from, to: range.to, groupBy: 'both' }),
    enabled: !!token && enabled,
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
  photoRate: number | null;
}

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
