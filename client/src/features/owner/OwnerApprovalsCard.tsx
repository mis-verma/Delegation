import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { InlineError, PANEL_CLASS } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { reportApi, type ApprovalKind, type ApprovalTat } from '../../api/reports';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { DashCardHeader, DashCardLink } from '../dashboard/DashCardHeader';
import { FigureCard } from '../dashboard/FigureCard';
import { orgDayWindow } from '../dashboard/scoreDrill';
import { ANALYTICS_QUERY_KEY } from '../admin/analytics/useAnalyticsQueries';
import { formatDuration } from '../admin/analytics/analyticsDisplay';
import { useCanOpen } from './useReadOnlyViewer';

const KINDS: readonly ApprovalKind[] = ['checklist', 'ticket', 'delegation'];
const KIND_NOUN: Record<ApprovalKind, [string, string]> = { checklist: ['checklist', 'checklists'], ticket: ['ticket', 'tickets'], delegation: ['delegation', 'delegations'] };

const breakdown = (data: ApprovalTat, pick: (w: ApprovalTat['waiting'][ApprovalKind]) => number, none: string) => {
  const parts = KINDS.filter((k) => pick(data.waiting[k]) > 0).map((k) => {
    const n = pick(data.waiting[k]);
    return `${n} ${KIND_NOUN[k][n === 1 ? 0 : 1]}`;
  });
  return parts.length ? parts.join(', ') : none;
};

interface OwnerApprovalsCardProps {
  from: string;
  to: string;
  periodLabel: string;
}

export const OwnerApprovalsCard = ({ from: dayFrom, to: dayTo, periodLabel }: OwnerApprovalsCardProps) => {
  const { token } = useAuth();
  const canOpen = useCanOpen();
  const { start: from, end: to } = orgDayWindow(dayFrom, dayTo);
  const query = useQuery({
    queryKey: [...ANALYTICS_QUERY_KEY, 'approval-tat', from, to],
    queryFn: () => reportApi.approvalTat(from, to),
    enabled: !!token,
    placeholderData: keepPreviousData,
    retry: handleQueryRetry,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const loading = query.isPending;
  const failed = query.isError && !data;
  const over = data?.waiting.total.over24h ?? null;

  return (
    <section aria-labelledby="owner-approvals-heading" className={cn(PANEL_CLASS, 'flex flex-col')}>
      <DashCardHeader
        id="owner-approvals-heading"
        title="Waiting for approval"
        subtitle="Live now. Approvals are promised within 24 hours"
        action={canOpen('/verify') ? <DashCardLink to="/verify">Open queue</DashCardLink> : undefined}
      />
      <div className="p-4">
        {failed ? (
          <InlineError message="Couldn't load the approval figures." onRetry={() => void query.refetch()} />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
            <FigureCard
              label="Waiting now"
              value={data?.waiting.total.now ?? null}
              tone="plain"
              loading={loading}
              help={data ? breakdown(data, (w) => w.now, 'Nothing is waiting') : undefined}
            />
            <FigureCard
              label="Over 24 hours"
              value={over}
              tone={over === null ? 'plain' : over > 0 ? 'bad' : 'good'}
              loading={loading}
              help={data ? breakdown(data, (w) => w.over24h, 'None past the 24 hour promise') : undefined}
            />
            <FigureCard
              label="Average decision time"
              short="Avg decision time"
              value={data?.avgDecisionHours ?? null}
              text={data?.avgDecisionHours != null ? formatDuration(data.avgDecisionHours) : undefined}
              tone="plain"
              loading={loading}
              help={data ? (data.decided > 0 ? `${data.decided} decided in this period` : 'Nothing was decided in this period') : undefined}
              caption={periodLabel}
            />
          </div>
        )}
      </div>
    </section>
  );
};
