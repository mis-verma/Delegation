import { useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useTasksQuery } from '../../../features/tasks/hook';
import { useTaskStatusMove } from '../../../features/tasks/useTaskStatusMove';
import { isTaskOverdue } from '../../../features/dashboard/dashboardDisplay';
import { DASHBOARD_QUERY_OPTIONS } from '../../../lib/dashboardQuery';
import { haptic } from '../../../lib/haptics';
import type { Task } from '../../../api/task';
import { DueChip } from '../../dueChip';
import { QuickAction, QuickList, QuickRow } from './QuickRow';
import { QUICK_MAX, byDueThenNewest, type PanelProps } from './quickShared';

const NEXT: Partial<Record<Task['status'], { label: string; to: Task['status'] }>> = {
  todo: { label: 'Start', to: 'in_progress' },
  in_progress: { label: 'Complete', to: 'pending_approval' },
  on_hold: { label: 'Resume', to: 'in_progress' },
};

export const QuickTasks = ({ now, onClose }: PanelProps) => {
  const { user } = useAuth();
  const query = useTasksQuery(undefined, true, undefined, DASHBOARD_QUERY_OPTIONS);
  const { requestMove, statusRemarkDialog } = useTaskStatusMove();
  const mine = useMemo(
    () =>
      (query.data ?? [])
        .filter(
          (t) =>
            (t.assigneeId === user?.id || t.additionalAssigneeIds?.includes(user?.id ?? '')) &&
            NEXT[t.status] &&
            !t.awaitingHeadApproval,
        )
        .map((t) => ({ task: t, due: t.dueDate ? new Date(t.dueDate).getTime() : null, created: new Date(t.createdAt).getTime() }))
        .sort(byDueThenNewest),
    [query.data, user?.id],
  );

  return (
    <>
      <QuickList
        pending={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        total={mine.length}
        emptyTitle="No delegations waiting on you"
        emptyHint="New ones will show up here."
      >
        {mine.slice(0, QUICK_MAX).map(({ task, due }) => {
          const next = NEXT[task.status];
          return (
            <QuickRow
              key={task.id}
              title={task.title}
              to={`/tasks?open=${task.id}`}
              onOpen={onClose}
              hot={isTaskOverdue(task, now)}
              meta={due !== null ? <DueChip at={due} now={now} /> : <span className="t-meta text-text-muted">No due date</span>}
              action={next && <QuickAction label={next.label} onClick={() => { haptic('tap'); requestMove(task, next.to); }} />}
            />
          );
        })}
      </QuickList>
      {statusRemarkDialog}
    </>
  );
};
