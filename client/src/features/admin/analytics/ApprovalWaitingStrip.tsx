import { SectionExport } from './ExportRegistry';
import { memo, useId } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Hourglass, ShieldQuestion, Timer } from 'lucide-react';
import { InlineError } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { reportApi, type ApprovalKind } from '../../../api/reports';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { SectionHeader } from '../../scores/SectionHeader';
import { StatTile } from './AnalyticsSummaryStrip';
import { ANALYTICS_QUERY_KEY } from './useAnalyticsQueries';
import { formatDuration } from './analyticsDisplay';

interface ApprovalWaitingStripProps {
  from?: string;
  to?: string;
}

const KIND_LABEL: Record<ApprovalKind, string> = { checklist: 'Checklists', ticket: 'Tickets', delegation: 'Delegations' };
const KINDS: ApprovalKind[] = ['checklist', 'ticket', 'delegation'];
const KIND_NOUN: Record<ApprovalKind, [string, string]> = { checklist: ['checklist', 'checklists'], ticket: ['ticket', 'tickets'], delegation: ['delegation', 'delegations'] };

const plural = (count: number, kind: ApprovalKind) => `${count} ${KIND_NOUN[kind][count === 1 ? 0 : 1]}`;

const breakdown = (pick: (kind: ApprovalKind) => number, none: string) => {
  const parts = KINDS.filter((k) => pick(k) > 0).map((k) => plural(pick(k), k));
  return parts.length ? parts.join(', ') : none;
};

const ApprovalWaitingStripBase = ({ from, to }: ApprovalWaitingStripProps) => {
  const headingId = useId();
  const navigate = useNavigate();
  const { token } = useAuth();

  const query = useQuery({
    queryKey: [...ANALYTICS_QUERY_KEY, 'approval-tat', from ?? null, to ?? null],
    queryFn: () => reportApi.approvalTat(from as string, to as string),
    enabled: !!token && !!from && !!to,
    placeholderData: keepPreviousData,
    retry: handleQueryRetry,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const loading = query.isPending;
  const failed = query.isError && !data;
  const open = () => navigate('/verify');

  const exportRows = (): TableRows => {
    if (!data) return [['Figure', 'Value']];
    const head = ['Kind', 'Waiting now', 'Waiting over 24 hours', 'Decided within 24 hours', 'Decided after 24 hours', 'Still waiting, inside 24 hours', 'Average decision time (hours)'];
    const rowFor = (label: string, waiting: { now: number; over24h: number }, counts: { met: number; breached: number; pending: number }, avg: number | null) =>
      [label, waiting.now, waiting.over24h, counts.met, counts.breached, counts.pending, avg == null ? null : Math.round(avg * 10) / 10];
    return [
      head,
      ...KINDS.map((k) => rowFor(KIND_LABEL[k], data.waiting[k], data.byKind[k], data.avgDecisionHoursByKind[k])),
      rowFor('All', data.waiting.total, { met: data.met, breached: data.breached, pending: data.pending }, data.avgDecisionHours),
      [],
      ['Decided within 24 hours %', exportPct(data.rate)],
    ];
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeader
        id={headingId}
        title="Waiting for approval"
        actions={
          <>
            <SectionExport
              disabled={!data}
              aria-label="Export the approval figures"
              filename="overview-waiting-for-approval"
              sheetName="Approvals"
              title={exportTitle({ what: 'Overview, waiting for approval', from, to })}
              getRows={exportRows}
            />
          </>
        }
      />

      {failed ? (
        <InlineError message="Could not load the approval figures." onRetry={() => void query.refetch()} />
      ) : (
        <div className="@container">
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 @3xl:[&>*:last-child:nth-child(odd)]:col-span-1">
            <StatTile
              icon={ShieldQuestion}
              iconTint="text-primary-600 dark:text-primary-400"
              label="Waiting for a decision"
              value={loading ? 'Loading' : data?.waiting.total.now ?? 0}
              isLoading={loading}
              caption={data ? breakdown((k) => data.waiting[k].now, 'Nothing is waiting') : undefined}
              lowerIsBetter
              onClick={open}
            />
            <StatTile
              icon={Hourglass}
              iconTint="text-warning"
              label="Waiting over 24 hours"
              value={loading ? 'Loading' : data?.waiting.total.over24h ?? 0}
              isLoading={loading}
              caption={data ? breakdown((k) => data.waiting[k].over24h, 'None past the 24 hour promise') : undefined}
              valueTone={data ? (data.waiting.total.over24h > 0 ? 'danger' : 'success') : undefined}
              lowerIsBetter
              onClick={open}
            />
            <StatTile
              icon={Timer}
              iconTint="text-coral-600 dark:text-coral-400"
              label="Average decision time"
              value={loading ? 'Loading' : data?.avgDecisionHours != null ? formatDuration(data.avgDecisionHours) : '—'}
              isLoading={loading}
              caption={data ? (data.decided > 0 ? `${data.decided} decided in the period` : 'Nothing was decided in the period') : undefined}
              lowerIsBetter
              onClick={open}
            />
          </div>
        </div>
      )}
    </section>
  );
};

export const ApprovalWaitingStrip = memo(ApprovalWaitingStripBase);
