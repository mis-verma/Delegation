import { Building2, User } from 'lucide-react';
import { EntityIconTile } from '../../../components';

interface TicketGroupHeaderProps {
  label: string;
  groupBy: 'department' | 'assignee';
  ticketCount: number;
  stats: { total: number; done: number };
}

// A quiet label above each group, not a boxed banner: small tile, the group name, and a plain
// count. The checklist tally is desktop-only; on a phone it pushed the count onto a second line.
export const TicketGroupHeader = ({ label, groupBy, ticketCount, stats }: TicketGroupHeaderProps) => {
  const Icon = groupBy === 'department' ? Building2 : User;

  return (
    <div className="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap px-0.5">
      <div className="flex items-center gap-2 min-w-0">
        <EntityIconTile icon={Icon} tone={groupBy === 'department' ? 'coral' : 'primary'} className="size-6 sm:size-7 rounded-md shrink-0" iconClassName="size-3.5 sm:size-4" />
        {/* Wraps rather than truncates: a long department or person name must stay readable. */}
        <h3 className="min-w-0 text-sm font-display font-semibold text-text tracking-tight leading-snug break-words">
          {label}
        </h3>
        <span className="text-xs font-semibold text-text-muted tabular-nums shrink-0">{ticketCount}</span>
      </div>

      {stats.total > 0 && (
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-display font-semibold px-2.5 py-1 rounded-full bg-primary-500/10 text-primary-700 dark:text-primary-300 shrink-0">
          <span className="tabular-nums">{stats.done}/{stats.total}</span>
          <span className="opacity-80">checklist items</span>
        </span>
      )}
    </div>
  );
};
