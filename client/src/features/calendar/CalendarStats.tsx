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

const Tile = ({ icon: Icon, label, value, tint }: TileProps) => (
  <div className="flex items-center gap-2.5 min-w-0 rounded-xl border border-border bg-surface p-2.5">
    <span className={`flex items-center justify-center size-9 rounded-lg shrink-0 ${TINT[tint].box} ${TINT[tint].text}`}>
      <Icon size={16} strokeWidth={2.5} />
    </span>
    <div className="flex flex-col min-w-0">
      <span className="text-lg font-display font-bold leading-none text-text tabular-nums">{value}</span>
      <span className="truncate text-[11px] font-medium text-text-muted pt-1">{label}</span>
    </div>
  </div>
);

/** Phones get four small tiles in a 2x2 grid (no sideways scrolling strip whose last chip gets
 *  sliced at the screen edge); sm and up get the full StatCards. */
export const CalendarStats = ({ stats, isPending, monthLabel, todayWeekday }: CalendarStatsProps) => {
  const show = (n: number) => (isPending ? '-' : n);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <Tile icon={CalendarIcon} label="This month" value={show(stats.inMonth)} tint="primary" />
        <Tile icon={AlertTriangle} label="Overdue" value={show(stats.overdueInMonth)} tint="danger" />
        <Tile icon={CalendarClock} label="Due today" value={show(stats.dueToday)} tint="coral" />
        <Tile icon={CalendarDays} label="Due this week" value={show(stats.dueThisWeek)} tint="primary" />
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
