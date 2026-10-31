import { memo, useMemo, type ReactNode } from 'react';
import { CheckCheck, Clock3, Flag, Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '../../components';
import { RadialGauge } from '../../components/radialGauge/RadialGauge';
import { complianceToneClass } from '../checklist/checklistDisplay';
import { DAY_MS, formatWaiting, type ChecklistRow } from './verificationModel';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';

interface QueueOverviewProps {
  loading: boolean;
  rows: ChecklistRow[];
  waitingTotal: number;
  oldestWaiting: number | null;
  now: number;
  partial: boolean;
  attentionActive: boolean;
  slowActive: boolean;
  onToggleAttention: () => void;
  onToggleSlow: () => void;
}

interface TileProps {
  icon: LucideIcon;
  tile: string;
  label: string;
  value: ReactNode;
  caption?: string;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
}

const Tile = ({ icon: Icon, tile, label, value, caption, onClick, pressed, disabled, className }: TileProps) => {
  const body = (
    <>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white sm:size-9', tile)} aria-hidden="true">
        <Icon className="size-4.5" strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="t-stat font-display font-extrabold tabular-nums leading-none text-text">{value}</span>
        <span className="t-meta font-display font-semibold text-text-secondary leading-tight">{label}</span>
        {caption && <span className="t-meta text-text-muted leading-tight max-sm:hidden">{caption}</span>}
      </span>
    </>
  );
  const base = 'flex min-w-0 items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors duration-150 sm:gap-3 sm:p-3';
  if (!onClick) return <div className={cn(base, 'border-border/60 bg-surface', className)}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        base,
        'cursor-pointer outline-none active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-default disabled:opacity-60',
        pressed ? 'border-primary-500/60 bg-primary-500/8' : 'border-border/60 bg-surface hover:border-border-hover',
        className,
      )}
    >
      {body}
    </button>
  );
};

const gaugeColor = (v: number | null) => (v === null ? 'var(--color-border-hover)' : v >= GOOD_FROM ? 'var(--color-success)' : v >= FAIR_FROM ? 'var(--color-warning)' : 'var(--color-danger)');

export const QueueOverview = memo(function QueueOverview({
  loading, rows, waitingTotal, oldestWaiting, now, partial, attentionActive, slowActive, onToggleAttention, onToggleSlow,
}: QueueOverviewProps) {
  const stats = useMemo(() => {
    let needsLook = 0;
    let critical = 0;
    let clean = 0;
    let slow = 0;
    let sum = 0;
    let counted = 0;
    for (const r of rows) {
      if (r.risk.needsAttention) needsLook += 1;
      if (r.risk.criticalFailed > 0) critical += 1;
      if (r.risk.clean) clean += 1;
      if (now - r.waitingSince >= 3 * DAY_MS) slow += 1;
      if (r.risk.compliance !== null) { sum += r.risk.compliance; counted += 1; }
    }
    return { needsLook, critical, clean, slow, average: counted ? Math.round(sum / counted) : null };
  }, [rows, now]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" role="status" aria-label="Loading overview">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className={cn('h-[4.25rem] rounded-xl', i === 0 && 'max-sm:hidden')} />)}
      </div>
    );
  }

  const avg = stats.average;
  return (
    <section aria-label="Checklist checks" className="flex flex-col gap-2">
      <h2 className="t-meta font-display font-semibold text-text-secondary">Checklist checks</h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Tile
          icon={Inbox}
          tile="from-primary-500 to-primary-700"
          label="Waiting for you"
          value={waitingTotal}
          caption={oldestWaiting ? `Oldest ${formatWaiting(oldestWaiting, now)}` : undefined}
          className="max-sm:hidden lg:col-span-1"
        />
        <Tile
          icon={Flag}
          tile={stats.critical > 0 ? 'from-danger to-danger/70' : 'from-warning to-warning/70'}
          label="Need a look"
          value={stats.needsLook}
          caption={stats.critical > 0 ? `${stats.critical} critical` : stats.needsLook ? 'Wrong answers or photos' : 'Nothing flagged'}
          onClick={onToggleAttention}
          pressed={attentionActive}
        />
        <Tile
          icon={CheckCheck}
          tile="from-success to-success-strong"
          label="Ready to approve"
          value={stats.clean}
          caption={stats.clean ? 'Approve them in one go below' : 'None are clean'}
        />
        <Tile
          icon={Clock3}
          tile="from-warning to-warning/70"
          label="Waiting 3+ days"
          value={stats.slow}
          caption={stats.slow ? 'Tap to show them' : 'Nothing is old'}
          onClick={onToggleSlow}
          pressed={slowActive}
        />
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border/60 bg-surface p-2.5 sm:gap-3 sm:p-3">
          <RadialGauge
            percent={avg ?? 0}
            size={44}
            variant="circle"
            gradientFrom={gaugeColor(avg)}
            gradientTo={gaugeColor(avg)}
            ariaLabel={`Average compliance ${avg === null ? 'not available' : `${avg}%`}`}
          >
            <span className={cn('t-meta font-display font-extrabold tabular-nums', avg === null ? 'text-text-light' : complianceToneClass(avg))}>{avg === null ? '-' : avg}</span>
          </RadialGauge>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="t-meta font-display font-semibold text-text-secondary leading-tight">Avg compliance</span>
            <span className="t-meta text-text-muted leading-tight">{rows.length} {rows.length === 1 ? 'checklist' : 'checklists'}</span>
          </span>
        </div>
      </div>
      {partial && <p className="t-meta text-text-muted">The counts cover the checklists loaded so far. Load more below to include the rest.</p>}
    </section>
  );
});
