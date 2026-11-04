import { SectionExport } from './ExportRegistry';
import { memo, useId } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { InlineError, PANEL_CLASS } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { reportApi, type ApprovalKind } from '../../../api/reports';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { WINDOW_LABEL } from '../../../lib/scoreLabels';
import { DashCardHeader, DashCardLink } from '../../dashboard/DashCardHeader';
import { FigureCard } from '../../dashboard/FigureCard';
import { orgDayWindow } from '../../dashboard/scoreDrill';
import { ANALYTICS_QUERY_KEY } from './useAnalyticsQueries';
import { formatDuration } from './analyticsDisplay';
import { useOverviewScoreWindow } from './useOverviewScores';

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

const isDay = (value?: string): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

const toWindow = (from?: string, to?: string) => {
  if (isDay(from) && isDay(to)) {
    const { start, end } = orgDayWindow(from, to);
    return { from: start, to: end };
  }
  return { from, to };
};

const ApprovalWaitingStripBase = ({ from: rawFrom, to: rawTo }: ApprovalWaitingStripProps) => {
  const { from, to } = toWindow(rawFrom, rawTo);
  const headingId = useId();
  const { token, user } = useAuth();
  const periodLabel = useOverviewScoreWindow(rawFrom, rawTo)?.label ?? 'This period';

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
  const canOpen = user?.role !== 'OWNER';
  const waitingTotal = data?.waiting.total.now ?? null;
  const over24 = data?.waiting.total.over24h ?? null;
  const avg = data?.avgDecisionHours ?? null;

  const exportRows = (): TableRows => {
    if (!data) return [['Figure', 'Value']];
    const head = ['Kind', 'Waiting now', 'Waiting over 24 hours', 'Decided within 24 hours', 'Decided after 24 hours', 'Still waiting, inside 24 hours', 'Average decision time (hours)'];
    const rowFor = (label: string, waiting: { now: number; over24h: number }, counts: { met: number; breached: number; pending: number }, average: number | null) =>
      [label, waiting.now, waiting.over24h, counts.met, counts.breached, counts.pending, average == null ? null : Math.round(average * 10) / 10];
    return [
      head,
      ...KINDS.map((k) => rowFor(KIND_LABEL[k], data.waiting[k], data.byKind[k], data.avgDecisionHoursByKind[k])),
      rowFor('All', data.waiting.total, { met: data.met, breached: data.breached, pending: data.pending }, data.avgDecisionHours),
      [],
      ['Decided within 24 hours %', exportPct(data.rate)],
    ];
  };

  const retry = () => void query.refetch();
  const openHref = canOpen ? '/verify' : undefined;

  return (
    <section aria-labelledby={headingId} className={`${PANEL_CLASS} flex flex-col overflow-hidden`}>
      <DashCardHeader
        id={headingId}
        title="Waiting for approval"
        count={waitingTotal}
        countLabel={waitingTotal != null ? `${waitingTotal} waiting now` : undefined}
        alert={!!over24 && over24 > 0}
        subtitle={`Waiting counts are live. Decision time covers ${periodLabel}.`}
        action={
          <div className="flex items-center gap-1.5">
            <SectionExport
              disabled={!data}
              aria-label="Export the approval figures"
              filename="overview-waiting-for-approval"
              sheetName="Approvals"
              title={exportTitle({ what: 'Overview, waiting for approval', from, to })}
              getRows={exportRows}
            />
            {canOpen && <DashCardLink to="/verify" label="Open the approval queue">Open</DashCardLink>}
          </div>
        }
      />

      <div className="p-4 sm:p-5">
        {failed ? (
          <InlineError message="Couldn't load the approval figures." onRetry={retry} />
        ) : (
          <div className="@container">
            <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 @3xl:[&>*:last-child:nth-child(odd)]:col-span-1">
              <FigureCard
                label="Waiting for a decision"
                short="Waiting"
                help={data ? breakdown((k) => data.waiting[k].now, 'Nothing is waiting') : undefined}
                value={waitingTotal}
                tone="plain"
                loading={loading}
                caption={WINDOW_LABEL.live}
                to={openHref}
              />
              <FigureCard
                label="Waiting over 24 hours"
                short="Over 24 hours"
                help={data ? breakdown((k) => data.waiting[k].over24h, 'None past the 24 hour promise') : undefined}
                value={over24}
                tone={over24 == null ? 'plain' : over24 > 0 ? 'bad' : 'good'}
                loading={loading}
                caption={WINDOW_LABEL.live}
                to={openHref}
              />
              <FigureCard
                label="Average decision time"
                short="Decision time"
                help={data ? (data.decided > 0 ? `${data.decided} decided in ${periodLabel}` : `Nothing was decided in ${periodLabel}`) : undefined}
                value={avg}
                text={avg != null ? formatDuration(avg) : undefined}
                tone="plain"
                loading={loading}
                caption={periodLabel}
                to={openHref}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export const ApprovalWaitingStrip = memo(ApprovalWaitingStripBase);
