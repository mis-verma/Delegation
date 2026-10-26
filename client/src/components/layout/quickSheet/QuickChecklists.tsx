import { useMemo } from 'react';
import { useMyFocusChecklistsQuery } from '../../../features/checklist/hook';
import { instanceDeadline, isInstanceEnded, isInstanceOverdue } from '../../../features/checklist/checklistDisplay';
import { DASHBOARD_QUERY_OPTIONS } from '../../../lib/dashboardQuery';
import { DueChip } from '../../dueChip';
import { QuickAction, QuickList, QuickRow } from './QuickRow';
import { QUICK_MAX, type PanelProps } from './quickShared';

export const QuickChecklists = ({ now, onClose }: PanelProps) => {
  const query = useMyFocusChecklistsQuery(DASHBOARD_QUERY_OPTIONS);
  const runs = useMemo(
    () =>
      (query.data ?? [])
        .filter((c) => !isInstanceEnded(c, now) && (c.verificationStatus === 'NOT_SUBMITTED' || c.verificationStatus === 'REJECTED'))
        .map((c) => {
          const done = c.items.filter((i) => i.isDone).length;
          const complete = c.items.length > 0 && done === c.items.length;
          const label = c.verificationStatus === 'REJECTED' ? 'Fix' : complete ? 'Submit' : 'Fill';
          return { run: c, done, complete, label, deadline: instanceDeadline(c), rank: c.verificationStatus === 'REJECTED' ? 0 : complete ? 1 : 2 };
        })
        .sort((a, b) => a.rank - b.rank || a.deadline - b.deadline),
    [query.data, now],
  );

  return (
    <QuickList
      pending={query.isPending}
      error={query.isError}
      onRetry={() => void query.refetch()}
      total={runs.length}
      emptyTitle="All checklists are in"
      emptyHint="Nothing to fill or send right now."
    >
      {runs.slice(0, QUICK_MAX).map(({ run, done, complete, label, deadline }) => (
        <QuickRow
          key={run.id}
          title={run.title}
          to={`/checklists/${run.id}`}
          onOpen={onClose}
          hot={run.verificationStatus === 'REJECTED' || isInstanceOverdue(run, complete, now)}
          meta={
            <>
              <span className="t-meta font-medium tabular-nums text-text-muted">{done} of {run.items.length} done</span>
              {deadline > 0 && <DueChip at={deadline} now={now} />}
            </>
          }
          action={<QuickAction label={label} to={`/checklists/${run.id}`} onOpen={onClose} />}
        />
      ))}
    </QuickList>
  );
};
