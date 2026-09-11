import { ChevronRight } from 'lucide-react';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { RadialGauge } from '../../components';
import { OverdueBadge, type OverdueItem } from './DepartmentCard';

export interface PersonCardRow {
  id: string;
  name: string;
  role: string;
  openTickets: number;
  openTasks: number;
  overdue: number;
  overdueItems: OverdueItem[];
  /** Closed tickets + done tasks, over every ticket/task ever raised for this person — `null` when
   *  there's nothing to measure yet, same "no data" convention as the Dashboard's Compliance gauges. */
  completionRate: number | null;
  completionCount: number;
  completionTotal: number;
}

export const PersonCard = ({ row, onClick }: { row: PersonCardRow; onClick: () => void }) => (
  <div className="group flex flex-col gap-3 p-4 rounded-2xl border border-border/60 bg-surface hover:border-primary-300 transition-colors duration-150">
    <div className="flex items-center justify-between gap-2">
      {/* Its own button, not the whole card — same reason as DepartmentCard: the overdue badge
          below is an independent popover trigger and can't nest inside another button. */}
      <button
        type="button"
        onClick={onClick}
        className="group/info flex items-center gap-2.5 min-w-0 text-left cursor-pointer outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/30"
      >
        <div className={`flex items-center justify-center size-9 rounded-full text-white text-xs font-bold shrink-0 ${avatarColorClass(row.name)}`}>
          {getInitials(row.name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-display font-bold text-text truncate group-hover/info:text-primary-600 dark:group-hover/info:text-primary-400 transition-colors">{row.name}</h3>
            <ChevronRight size={13} className="shrink-0 text-text-light opacity-0 group-hover/info:opacity-100 group-hover/info:translate-x-0.5 transition-all duration-150" />
          </div>
          <p className="text-[11px] font-display font-medium text-text-muted truncate">{row.role}</p>
        </div>
      </button>

      {/* Same completion ring as DepartmentCard — one person's own record, not the department's.
          Decorative here too — the name button above is this card's navigation trigger. */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <RadialGauge percent={row.completionRate ?? 0} size={48} variant="circle" gradientFrom="var(--color-primary-600)" gradientTo="var(--color-primary-600)">
          <span className={`text-[10px] font-display font-black ${row.completionRate == null ? 'text-text-muted/50' : 'text-text'}`}>
            {row.completionRate == null ? '—' : `${row.completionRate}%`}
          </span>
        </RadialGauge>
        {row.completionTotal > 0 && (
          <span className="text-[9px] font-display font-medium text-text-light tabular-nums whitespace-nowrap">{row.completionCount}/{row.completionTotal} done</span>
        )}
      </div>
    </div>

    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
      <span className="text-xs font-display font-medium text-text-muted">
        <strong className="font-display font-bold text-text">{row.openTickets}</strong> tickets · <strong className="font-display font-bold text-text">{row.openTasks}</strong> delegations
      </span>
      <OverdueBadge count={row.overdue} items={row.overdueItems} />
    </div>
  </div>
);
