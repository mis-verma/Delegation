import type { LucideIcon } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { StatCard, type Trend } from '../../dashboard';
import { ActiveRangeBadge, EntityIconTile, Skeleton } from '../../../components';

// Chart-shaped, not a spinner — every sibling card on this page (gauges, leader rows, store
// tables) already loads in with a placeholder shaped like its real content; the chart was the one
// slot that fell back to a generic "Loading…" spinner instead.
const ChartSkeleton = () => (
  <div className="h-[260px] flex items-end gap-2 px-2">
    {[45, 70, 55, 85, 40, 65, 50, 75, 60, 35, 80, 55].map((h, i) => (
      <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
    ))}
  </div>
);

interface KpiCardConfig {
  icon: LucideIcon;
  iconTint: string;
  label: string;
  /** `number` lets StatCard apply thousands separators; pre-formatted strings ("85%", "12h") pass through. */
  value: string | number;
  trend: Trend;
  /** For metrics where rising is bad news (Overdue, Avg TAT) — colours the trend badge correctly. */
  lowerIsBetter?: boolean;
  /** Small qualifier text under the trend badge — e.g. distinguishing a bucketed/scoped count from
   *  a same-labelled but differently-scoped number shown elsewhere on the same page. */
  caption?: string;
  /** These cards are bucketed/averaged rates, not a literal record list (see each section's own
   *  comment for why that rules out a `DrilldownModal` here) — `onClick` is a plain navigate to
   *  the real records the rate is computed from, same "give every stat *somewhere* to go" rule
   *  `AnalyticsSummaryStrip`'s cards already follow. Omitted entirely (not just falsy) when no
   *  role-reachable destination exists for the current viewer. */
  onClick?: () => void;
}

interface KpiSectionShellProps {
  icon: LucideIcon;
  title: string;
  description: string;
  isPending: boolean;
  isError: boolean;
  errorMessage: string;
  cards: KpiCardConfig[];
  chart: React.ReactNode;
  from?: string;
  to?: string;
}

// Shared layout for every KPI group on the analytics page (header, stat cards, chart card, plus
// loading/error states) — each report just supplies its own data + chart. Adding another chart to
// the dashboard means writing one thin section component, not repeating this scaffolding.
export const KpiSectionShell = ({ icon: Icon, title, description, isPending, isError, errorMessage, cards, chart, from, to }: KpiSectionShellProps) => (
  <section className="flex flex-col gap-6">
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-4">
        <EntityIconTile icon={Icon} tone="primary" />
        <div>
          <h2 className="text-xl font-display font-bold text-text">{title}</h2>
          <p className="text-sm font-display text-text-muted leading-relaxed">{description}</p>
        </div>
      </div>

      <ActiveRangeBadge from={from} to={to} />
    </header>

    {isError ? (
      // rounded-2xl, not rounded-xl — this is an alternative render of the same chart-card slot
      // below (isError ? this : the rounded-2xl chart card), so the two used to visibly flip
      // corner radius depending on whether the request failed.
      <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger/30 rounded-2xl">
        <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
        <p className="text-sm font-display font-medium text-danger">{errorMessage}</p>
      </div>
    ) : (
      <div className="flex flex-col gap-6">
        {/* Caps at 2 columns when there are only 2 cards (e.g. Delegation Checklists) instead of
            always reserving a 3rd column that then sits visibly empty. */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 ${cards.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
          {cards.map((c) => (
            <StatCard key={c.label} {...c} />
          ))}
        </div>

        {/* border/60 + a faint white hairline in dark mode — matches DASHBOARD_CARD_CLASS so this
            chart card and the ones on the Dashboard page don't visibly use two different card
            treatments. The radial wash is the same "give a flat surface a little life" move as
            StatCard's decorative hero variant, just far subtler here since this card holds real
            data, not a KPI headline. */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface p-6">
          <div
            className="absolute -top-16 -right-16 size-48 rounded-full bg-primary-500/[0.06] dark:bg-primary-400/[0.08] blur-2xl pointer-events-none"
            aria-hidden="true"
          />
          <div className="relative">{isPending ? <ChartSkeleton /> : chart}</div>
        </div>
      </div>
    )}
  </section>
);
