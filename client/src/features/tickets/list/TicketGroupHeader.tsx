import { Building2, ListChecks, User } from 'lucide-react';
import { EntityIconTile, IconChip } from '../../../components';

interface TicketGroupHeaderProps {
  label: string;
  groupBy: 'department' | 'assignee';
  ticketCount: number;
  stats: { total: number; done: number };
}

export const TicketGroupHeader = ({ label, groupBy, ticketCount, stats }: TicketGroupHeaderProps) => {
  const Icon = groupBy === 'department' ? Building2 : User;

  return (
    <div className="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap px-0.5">
      <div className="flex items-center gap-2 min-w-0">
        <EntityIconTile icon={Icon} tone={groupBy === 'department' ? 'coral' : 'primary'} className="size-6 sm:size-7 rounded-md shrink-0" iconClassName="size-3.5 sm:size-4" />
        <h3 className="min-w-0 t-card font-display font-semibold text-text tracking-tight leading-snug break-words">
          {label}
        </h3>
        <span className="t-meta font-semibold text-text-muted tabular-nums shrink-0">{ticketCount}</span>
      </div>

      {stats.total > 0 && (
        <IconChip className="hidden sm:inline-flex shrink-0" icon={ListChecks} tone="bg-primary-600" label={`${stats.done}/${stats.total} checklist items`} labelClassName="tabular-nums" />
      )}
    </div>
  );
};
