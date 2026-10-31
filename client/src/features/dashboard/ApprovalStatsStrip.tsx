import { memo } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { Hourglass, Timer, BadgeCheck, ShieldQuestion, type LucideIcon } from 'lucide-react';
import { InlineError } from '../../components/inlineError';
import { Skeleton } from '../../components/skeleton';
import { CountUp } from '../../components/countUp';
import { useOrgToday } from '../checklist/useOrgToday';
import { useApprovalDays, useTeamApprovals } from '../attention/useAttention';
import { formatDuration } from '../admin/analytics/analyticsDisplay';
import { ApprovalRing } from './ApprovalRing';
import { Sparkline } from './Sparkline';
import { windowFor } from './scorePeriods';
import { orgDayWindow } from './scoreDrill';

export type StatAccent = 'blue' | 'sky' | 'green' | 'red';

export interface StatProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  caption: string;
  accent?: StatAccent;
  format?: (n: number) => string;
  decimals?: number;
  progress?: number | null;
  trend?: readonly (number | null)[];
  trendLabel?: string;
  alert?: boolean;
  mutedAtZero?: boolean;
  loading: boolean;
  to?: string | null;
  index?: number;
}

const TILE: Record<StatAccent, string> = {
  blue: 'bg-linear-to-br from-vivid-blue to-vivid-blue/70',
  sky: 'bg-linear-to-br from-vivid-sky to-vivid-sky/70',
  green: 'bg-linear-to-br from-vivid-green to-vivid-green/70',
  red: 'bg-linear-to-br from-vivid-red to-vivid-red/70',
};

const SURFACE: Record<StatAccent, string> = {
  blue: 'border-vivid-blue/25 bg-vivid-blue/5 hover:border-vivid-blue/50',
  sky: 'border-vivid-sky/25 bg-vivid-sky/5 hover:border-vivid-sky/50',
  green: 'border-vivid-green/25 bg-vivid-green/5 hover:border-vivid-green/50',
  red: 'border-vivid-red/30 bg-vivid-red/6 hover:border-vivid-red/55',
};

const BAR: Record<StatAccent, string> = {
  blue: 'bg-vivid-blue',
  sky: 'bg-vivid-sky',
  green: 'bg-vivid-green',
  red: 'bg-vivid-red',
};

const TREND_TONE: Record<StatAccent, string> = {
  blue: 'text-vivid-blue',
  sky: 'text-vivid-sky',
  green: 'text-vivid-green',
  red: 'text-vivid-red',
};

const VALUE: Record<StatAccent, string> = {
  blue: 'text-vivid-blue-text',
  sky: 'text-vivid-sky-text',
  green: 'text-vivid-green-text',
  red: 'text-vivid-red-text',
};

const MUTED_SURFACE = 'border-border/60 bg-surface hover:border-border-hover';

const BASE = 'stat-rise relative flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border px-3 py-3 transition-colors duration-150';

export const Stat = ({ icon: Icon, label, value, caption, accent = 'blue', format, decimals = 0, progress, trend, trendLabel, alert = false, mutedAtZero = false, loading, to, index = 0 }: StatProps) => {
  const muted = mutedAtZero && !loading && value === 0;
  const style = { '--stat-delay': `${index * 60}ms` } as React.CSSProperties;
  const body = (
    <>
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', muted ? 'bg-surface-hover text-text-muted' : cn('text-white', TILE[accent]))}>
        <Icon className="size-5" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="t-meta font-semibold text-text-secondary line-clamp-1">{label}</span>
        {loading ? (
          <Skeleton className="h-7 w-14" />
        ) : (
          <span className={cn('t-stat font-display font-extrabold tabular-nums leading-none', muted ? 'text-text-muted' : VALUE[accent])}>
            {value == null ? '—' : <CountUp value={value} decimals={decimals} format={format} fromZero />}
          </span>
        )}
        {progress != null && !loading && (
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-border/60" aria-hidden="true">
            <span className={cn('bar-grow block h-full rounded-full', BAR[accent])} style={{ width: `${Math.max(3, Math.min(100, progress))}%` }} />
          </span>
        )}
        <span className="t-meta text-text-muted line-clamp-1">{caption}</span>
        {trend && !loading && (
          <Sparkline values={trend} tone={TREND_TONE[accent]} label={trendLabel ?? 'Last 7 days'} />
        )}
      </div>
      {alert && !loading && (
        <span aria-hidden="true" className="live-dot absolute right-2.5 top-2.5 size-2 rounded-full bg-vivid-red" />
      )}
    </>
  );
  const surface = muted ? MUTED_SURFACE : SURFACE[accent];
  if (!to) return <div className={cn(BASE, surface)} style={style}>{body}</div>;
  return (
    <Link
      to={to}
      viewTransition
      style={style}
      className={cn(BASE, surface, 'outline-none active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/50')}
    >
      {body}
    </Link>
  );
};

const addDays = (day: string, delta: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

export const ApprovalStatsStrip = memo(() => {
  const today = useOrgToday();
  const win = windowFor('week', 0, today);
  const to = win.to > today ? today : win.to;
  const { start, end } = orgDayWindow(win.from, to);
  const query = useTeamApprovals(start, end);
  const data = query.data;
  const loading = query.isPending;
  const days = useApprovalDays(addDays(today, -6), today).data;
  const inflow = days?.map((d) => d.submitted);
  const onTime = days?.map((d) => d.rate);

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

  return (
    <div className="@container border-b border-border/40 px-4 py-3 sm:px-5" role="group" aria-label="Approval figures">
      <ApprovalRing />
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @3xl:grid-cols-4">
        <Stat
          index={0}
          icon={ShieldQuestion}
          label="Waiting now"
          value={waiting}
          caption={waiting === 0 ? 'Nothing pending' : 'Awaiting a decision'}
          accent="blue"
          mutedAtZero
          trend={inflow}
          trendLabel="Handed in for approval, last 7 days"
          loading={loading}
        />
        <Stat
          index={1}
          icon={Hourglass}
          label="Over 24 hours"
          value={over}
          caption={over === 0 ? 'None past the limit' : 'Past the 24 hour limit'}
          accent={over > 0 ? 'red' : 'green'}
          alert={over > 0}
          loading={loading}
        />
        <Stat
          index={2}
          icon={Timer}
          label="Average decision time"
          value={data?.avgDecisionHours ?? null}
          decimals={1}
          format={formatDuration}
          caption={data && data.decided > 0 ? `${data.decided} decided this week` : 'Nothing decided this week'}
          accent="sky"
          loading={loading}
        />
        <Stat
          index={3}
          icon={BadgeCheck}
          label="Decided within 24 hours"
          value={rate}
          format={(n) => `${Math.round(n)}%`}
          progress={rate}
          caption="This week"
          accent={rate == null || rate >= 70 ? 'green' : 'red'}
          trend={onTime}
          trendLabel="Decided within 24 hours, last 7 days"
          loading={loading}
        />
      </div>
    </div>
  );
});
ApprovalStatsStrip.displayName = 'ApprovalStatsStrip';
