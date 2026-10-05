import { useCallback } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { holidayApi, type NewHoliday } from '../../../api/holidays';
import { handleQueryRetry } from '../../../lib/queryHelpers';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const KEY = ['holidays'] as const;

export const useHolidaysQuery = (year: number) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEY, year],
    queryFn: () => holidayApi.getByYear(year).then(r => r.data),
    enabled: !!token,
    retry: handleQueryRetry,
    // Stepping to another year keeps the current list on screen (dimmed) instead of flashing skeletons.
    placeholderData: keepPreviousData,
  });
};

// A holiday also clears that day's unstarted daily runs, so the checklist lists and counts have to
// reload along with the holiday list.
const useRefreshAfterChange = () => {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
    queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });
  }, [queryClient]);
};

const runsNote = (removed: number) =>
  removed > 0 ? `${removed} checklist${removed === 1 ? '' : 's'} nobody had started ${removed === 1 ? 'was' : 'were'} removed for that day.` : undefined;

export const useCreateHolidayMutation = () => {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (payload: NewHoliday) => holidayApi.create(payload),
    onSuccess: (res) => {
      refresh();
      toast.success('Holiday added', { description: runsNote(res.removedRuns) });
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't add the holiday")),
  });
};

export const useCreateHolidaysMutation = () => {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (payload: NewHoliday[]) => holidayApi.createMany(payload),
    onSuccess: (res) => {
      refresh();
      const skipped = res.skipped ? `${res.skipped} already on the list.` : '';
      toast.success(res.created ? `${res.created} holiday${res.created === 1 ? '' : 's'} added` : 'Nothing new to add', {
        description: [runsNote(res.removedRuns), skipped].filter(Boolean).join(' ') || undefined,
      });
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't add the holidays")),
  });
};

/** How many runs adding these dates would clear, summed. Only the dates that can already have runs (today or earlier). */
export const previewHolidayClears = async (dates: string[]) => {
  const results = await Promise.all(dates.map(d => holidayApi.preview(d)));
  return results.reduce(
    (sum, r) => ({ untouchedRuns: sum.untouchedRuns + r.untouchedRuns, startedRuns: sum.startedRuns + r.startedRuns }),
    { untouchedRuns: 0, startedRuns: 0 },
  );
};

export const useDeleteHolidayMutation = () => {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (id: string) => holidayApi.remove(id),
    onSuccess: (res) => {
      refresh();
      // `backfilled` is the server's own word on whether that day gets its checklists back: today and
      // later are created again, a past day is never filled in retroactively.
      toast.success('Holiday removed', {
        description: res.backfilled
          ? "Today's and future checklists appear within the hour."
          : 'Past days are not filled in again.',
      });
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't remove the holiday")),
  });
};
