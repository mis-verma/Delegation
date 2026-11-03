import { memo } from 'react';
import { ApprovalSection } from './ApprovalSection';
import { useNavigate } from 'react-router';
import { InlineError } from '../../components/inlineError';
import { useOrgToday } from '../checklist/useOrgToday';
import { useTeamApprovals } from '../attention/useAttention';
import { formatDuration } from '../admin/analytics/analyticsDisplay';
import { FigurePanel, type FigureCell } from '../verification/FigurePanel';
import { usePcApprovalBuckets } from '../pc/usePcApprovalBuckets';
import { FAIR_FROM } from '../../lib/scoreBands';
import { useApprovalSources } from './useApprovalSources';
import { windowFor } from './scorePeriods';
import { orgDayWindow } from './scoreDrill';

export type ApprovalBucket = 'all' | 'late' | 'fresh';

interface ApprovalStatsStripProps {
  bucket?: ApprovalBucket;
  onBucket?: (bucket: ApprovalBucket) => void;
}

export const ApprovalStatsStrip = memo(({ bucket = 'all', onBucket }: ApprovalStatsStripProps) => {
  const today = useOrgToday();
  const win = windowFor('week', 0, today);
  const to = win.to > today ? today : win.to;
  const { start, end } = orgDayWindow(win.from, to);
  const query = useTeamApprovals(start, end);
  const data = query.data;
  const loading = query.isPending;
  const { queueHref } = useApprovalSources();
  const buckets = usePcApprovalBuckets();
  const navigate = useNavigate();
  const toQueue = queueHref ?? undefined;

  if (query.isError && !data) {
    return (
      <div className="px-4 py-3 sm:px-5 border-b border-border/40">
        <InlineError message="Couldn't load the approval figures." onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const rate = data?.rate ?? null;
  const avg = data?.avgDecisionHours ?? null;
  const { pending, old, fresh } = buckets.total;
  const pick = (next: ApprovalBucket) => (onBucket ? () => onBucket(bucket === next ? 'all' : next) : toQueue ? () => navigate(toQueue) : undefined);
  const cells: FigureCell[] = [
    { key: 'pending', label: 'Pending', value: pending, note: pending === 0 ? 'All decided' : 'Waiting for you', help: 'Everything handed in that is still waiting for your decision. Tap to show them all.', onClick: pick('all') },
    { key: 'delayed', label: 'Delayed', value: old, note: old === 0 ? 'None late' : 'Over 24 hours', alert: old > 0, help: 'Waiting items that have passed the 24 hour limit. Tap to show only these.', selected: bucket === 'late', onClick: pick('late') },
    { key: 'new', label: 'New', value: fresh, note: 'Under 24 hours', help: 'Items that arrived in the last 24 hours. Tap to show only these.', selected: bucket === 'fresh', onClick: pick('fresh') },
    { key: 'ontime', label: 'On time', value: rate === null ? null : `${Math.round(rate)}%`, note: 'This week', alert: rate !== null && rate < FAIR_FROM, help: `Share of this week's decisions made within 24 hours.${avg === null ? '' : ` Average decision time ${formatDuration(avg)}.`}`, onClick: toQueue ? () => navigate(toQueue) : undefined },
  ];

  return (
    <ApprovalSection title="Waiting for your decision" className="@container">
      <FigurePanel cells={cells} label="Approval figures" loading={loading || buckets.approvals.isPending} phoneColumns={2} />
    </ApprovalSection>
  );
});
ApprovalStatsStrip.displayName = 'ApprovalStatsStrip';
