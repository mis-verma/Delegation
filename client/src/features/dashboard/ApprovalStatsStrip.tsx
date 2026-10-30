import { memo } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { Hourglass, Timer, BadgeCheck, ShieldQuestion, type LucideIcon } from 'lucide-react';
import { InlineError } from '../../components/inlineError';
import { Skeleton } from '../../components/skeleton';
import { useOrgToday } from '../checklist/useOrgToday';
import { useTeamApprovals } from '../attention/useAttention';
import { formatDuration } from '../admin/analytics/analyticsDisplay';
import { windowFor } from './scorePeriods';
import { orgDayWindow } from './scoreDrill';

export interface StatProps {
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
  tone?: 'default' | 'danger' | 'success';
  loading: boolean;
  to?: string | null;
}

const TONE: Record<NonNullable<StatProps['tone']>, string> = {
  default: 'text-text',
  danger: 'text-danger',
  success: 'text-success',
};

const ICON_TINT: Record<NonNullable<StatProps['tone']>, string> = {
  default: 'bg-vivid-blue/10 text-vivid-blue-text',
  danger: 'bg-danger/10 text-danger',
  success: 'bg-success/10 text-success',
};

const STAT_CLASS = 'flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2.5';

export const Stat = ({ icon: Icon, label, value, caption, tone = 'default', loading, to }: StatProps) => {
  const body = (
    <>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', ICON_TINT[tone])}>
        <Icon className="size-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="t-meta font-medium text-text-muted line-clamp-1">{label}</span>
        {loading ? (
          <Skeleton className="h-6 w-12" />
        ) : (
          <span className={cn('t-stat font-display font-bold tabular-nums leading-none', TONE[tone])}>{value}</span>
        )}
        <span className="t-meta text-text-muted line-clamp-1">{caption}</span>
      </div>
    </>
  );
  if (!to) return <div className={STAT_CLASS}>{body}</div>;
  return (
    <Link
      to={to}
      viewTransition
      className={cn(STAT_CLASS, 'outline-none transition-colors duration-150 hover:border-vivid-blue/50 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/50')}
    >
      {body}
    </Link>
  );
};

export const ApprovalStatsStrip = memo(() => {
  const today = useOrgToday();
  const win = windowFor('week', 0, today);
  const to = win.to > today ? today : win.to;
  const { start, end } = orgDayWindow(win.from, to);
  const query = useTeamApprovals(start, end);
  const data = query.data;
  const loading = query.isPending;

  if (query.isError && !data) {
    return (
      <div className="px-4 py-3 sm:px-5 border-b border-border/40">
        <InlineError message="Couldn't load the approval figures." onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const waiting = data?.waiting.total.now ?? 0;
  const over = data?.waiting.total.over24h ?? 0;
  const rate = data?.rate;

  return (
    <div className="@container border-b border-border/40 px-4 py-3 sm:px-5" role="group" aria-label="Approval figures">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @3xl:grid-cols-4">
        <Stat
          icon={ShieldQuestion}
          label="Waiting now"
          value={String(waiting)}
          caption={waiting === 0 ? 'Nothing pending' : 'Awaiting a decision'}
          loading={loading}
        />
        <Stat
          icon={Hourglass}
          label="Over 24 hours"
          value={String(over)}
          caption={over === 0 ? 'None past the limit' : 'Past the 24 hour limit'}
          tone={data ? (over > 0 ? 'danger' : 'success') : 'default'}
          loading={loading}
        />
        <Stat
          icon={Timer}
          label="Average decision time"
          value={formatDuration(data?.avgDecisionHours)}
          caption={data && data.decided > 0 ? `${data.decided} decided this week` : 'Nothing decided this week'}
          loading={loading}
        />
        <Stat
          icon={BadgeCheck}
          label="Decided within 24 hours"
          value={rate == null ? '—' : `${rate}%`}
          caption="This week"
          tone={rate == null ? 'default' : rate >= 90 ? 'success' : rate >= 70 ? 'default' : 'danger'}
          loading={loading}
        />
      </div>
    </div>
  );
});
ApprovalStatsStrip.displayName = 'ApprovalStatsStrip';
