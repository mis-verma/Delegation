import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { taskApi, type Task } from '../../api/task';
import { handleQueryRetry } from '../../lib/queryHelpers';

const PAGE_SIZE = 200;
const MAX_PAGES = 20;

export const usePendingTasksQuery = (status: Task['status'] = 'pending_approval', enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['tasks', 'verification-queue', status],
    queryFn: async (): Promise<{ data: Task[]; total: number }> => {
      const first = await taskApi.getAll(undefined, status, 1, PAGE_SIZE, undefined, undefined, true);
      const pages = Math.min(first.meta?.totalPages ?? 1, MAX_PAGES);
      const rest = pages > 1
        ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => taskApi.getAll(undefined, status, i + 2, PAGE_SIZE, undefined, undefined, true)))
        : [];
      const byId = new Map<string, Task>();
      for (const page of [first, ...rest]) for (const t of page.data) if (!byId.has(t.id)) byId.set(t.id, t);
      const data = [...byId.values()];
      return { data, total: first.meta?.total ?? data.length };
    },
    enabled: !!token && enabled,
    retry: handleQueryRetry,
  });
};
