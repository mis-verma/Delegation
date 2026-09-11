import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { StatCard, type Trend } from '../../dashboard';
import { ActiveRangeBadge } from '../../../components';

interface KpiCardConfig {
  icon: LucideIcon;
  iconTint: string;
  label: string;
  /** `number` lets StatCard apply thousands separators; pre-formatted strings ("85%", "12h") pass through. */
  value: string | number;
  trend: Trend;
  /** For metrics where rising is bad news (Overdue, Avg TAT) — colours the trend badge correctly. */
  lowerIsBetter?: boolean;
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
        <div className="flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0">
          <Icon className="w-6 h-6" />
        </div>
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

        <div className="rounded-2xl border border-border bg-surface p-6">
          {isPending ? (
            <div className="h-[260px] flex flex-col items-center justify-center gap-3 text-text-muted">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              <span className="text-sm font-display">Loading…</span>
            </div>
          ) : (
            chart
          )}
        </div>
      </div>
    )}
  </section>
);
