import { Calendar as CalendarIcon, CalendarClock, AlertTriangle, CalendarDays, type LucideIcon } from 'lucide-react';
import { StatCard } from '../dashboard';

export interface CalendarStatValues {
  inMonth: number;
  overdueInMonth: number;
  dueToday: number;
  dueThisWeek: number;
}

interface CalendarStatsProps {
  stats: CalendarStatValues;
  isPending: boolean;
  monthLabel: string;
  todayWeekday: string;
}

const TINT = {
  primary: { box: 'bg-primary-500/10', text: 'text-primary-600 dark:text-primary-400' },
  danger: { box: 'bg-danger/10', text: 'text-danger' },
  coral: { box: 'bg-coral-500/10', text: 'text-coral-600 dark:text-coral-400' },
} as const;

interface TileProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tint: keyof typeof TINT;
}

// One quarter of the phone's stat strip: a small icon over the number, the name under it.
const Tile = ({ icon: Icon, label, value, tint }: TileProps) => (
  <div className="flex min-w-0 flex-col items-center gap-0.5 px-1 py-2 text-center">
    <span className={`inline-flex items-center gap-1 ${TINT[tint].text}`}>
      <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
      <span className={`t-card font-display font-bold leading-none tabular-nums ${tint === 'danger' ? 'text-danger' : 'text-text'}`}>{value}</span>
    </span>
    <span className="truncate t-meta font-medium text-text-muted">{label}</span>
  </div>
);

/** Phones get one slim strip of four (like a calendar app's summary row, nothing scrolls sideways); sm and up get the
 *  full StatCards. */
export const CalendarStats = ({ stats, isPending, monthLabel, todayWeekday }: CalendarStatsProps) => {
  const show = (n: number) => (isPending ? '-' : n);

  return (
    <>
      <div className="grid grid-cols-4 divide-x divide-border/60 rounded-xl border border-border/60 bg-surface sm:hidden">
        <Tile icon={CalendarIcon} label="Month" value={show(stats.inMonth)} tint="primary" />
        <Tile icon={AlertTriangle} label="Overdue" value={show(stats.overdueInMonth)} tint="danger" />
        <Tile icon={CalendarClock} label="Today" value={show(stats.dueToday)} tint="coral" />
        <Tile icon={CalendarDays} label="This week" value={show(stats.dueThisWeek)} tint="primary" />
      </div>

      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatCard
          icon={CalendarIcon}
          label="This month"
          value={show(stats.inMonth)}
          caption={monthLabel}
          highlight
          decorative
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={show(stats.overdueInMonth)}
          caption="This month"
          iconBgTint="bg-danger/10"
          iconTint="text-danger"
        />
        <StatCard
          icon={CalendarClock}
          label="Due today"
          value={show(stats.dueToday)}
          caption={todayWeekday}
          iconBgTint="bg-coral-500/10"
          iconTint="text-coral-600 dark:text-coral-400"
        />
        <StatCard
          icon={CalendarDays}
          label="Due this week"
          value={show(stats.dueThisWeek)}
          caption="Sun to Sat"
          iconBgTint="bg-primary-500/10"
          iconTint="text-primary-600 dark:text-primary-400"
        />
      </div>
    </>
  );
};
