import { memo } from 'react';
import { InlineError } from '../../components/inlineError';
import { useOrgToday } from '../checklist/useOrgToday';
import { useTeamApprovals } from '../attention/useAttention';
import { formatDuration } from '../admin/analytics/analyticsDisplay';
import { ApprovalRing } from './ApprovalRing';
import { FigureCard, type FigureTone } from './FigureCard';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';
import { useApprovalSources } from './useApprovalSources';
import { windowFor } from './scorePeriods';
import { orgDayWindow } from './scoreDrill';

const rateTone = (rate: number): FigureTone => (rate >= GOOD_FROM ? 'good' : rate >= FAIR_FROM ? 'fair' : 'bad');

export const ApprovalStatsStrip = memo(() => {
  const today = useOrgToday();
  const win = windowFor('week', 0, today);
  const to = win.to > today ? today : win.to;
  const { start, end } = orgDayWindow(win.from, to);
  const query = useTeamApprovals(start, end);
  const data = query.data;
  const loading = query.isPending;
  const { queueHref } = useApprovalSources();
  const toQueue = queueHref ?? undefined;

  if (query.isError && !data) {
    return (
      <div className="px-4 py-3 sm:px-5 border-b border-border/40">
        <InlineError message="Couldn't load the approval figures." onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const waiting = data?.waiting.total.now ?? 0;
  const over = data?.waiting.total.over24h ?? 0;
  const rate = data?.rate ?? null;
  const avg = data?.avgDecisionHours ?? null;
  const withinShare = waiting === 0 ? 100 : ((waiting - over) / waiting) * 100;
  const overShare = waiting === 0 ? 0 : (over / waiting) * 100;

  return (
    <div className="@container border-b border-border/40 px-4 py-3 sm:px-5" role="group" aria-label="Approval figures">
      <ApprovalRing />
      <dl className="grid grid-cols-3 gap-2">
        <FigureCard
          label="Waiting now"
          help="Items handed in for approval that are still waiting for a decision."
          value={waiting}
          tone={waiting === 0 ? 'good' : rateTone(withinShare)}
          bar={withinShare}
          loading={loading}
          compact
          to={toQueue}
        />
        <FigureCard
          label="Over 24 hours"
          help="Waiting items that have passed the 24 hour limit."
          value={over}
          tone={over === 0 ? 'good' : 'bad'}
          bar={overShare}
          loading={loading}
          compact
          to={toQueue}
        />
        <FigureCard
          label="On time"
          help={`Share of this week's decisions made within 24 hours.${avg === null ? '' : ` Average decision time ${formatDuration(avg)}.`}`}
          value={rate}
          format={(n) => `${Math.round(n)}%`}
          tone={rate === null ? 'plain' : rateTone(rate)}
          bar={rate}
          loading={loading}
          compact
          to={toQueue}
        />
      </dl>
    </div>
  );
});
ApprovalStatsStrip.displayName = 'ApprovalStatsStrip';
