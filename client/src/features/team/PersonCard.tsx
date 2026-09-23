import { ChevronRight, Ticket as TicketIcon, CheckSquare } from 'lucide-react';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { RadialGauge } from '../../components';
import { OverdueBadge, type OverdueItem } from './DepartmentCard';
import { completionGaugeColor } from './teamDisplay';

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

export const PersonCard = ({ row, onClick, index = 0 }: { row: PersonCardRow; onClick: () => void; index?: number }) => (
  // The whole card is the click target now, not just the name — same "div with a button role, not
  // a real button" reasoning as DepartmentCard: the overdue badge below is still its own
  // independently-clickable popover trigger, and its own onClick stops propagation so it opens the
  // popover instead of also navigating the card.
  <div
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    // Same hover-lift + staggered entrance as DepartmentCard — see its own comment.
    className="group flex flex-col gap-3 p-4 rounded-2xl border border-border/60 bg-surface hover:border-primary-300 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
    style={{ animationFillMode: 'backwards', animationDelay: `${Math.min(index, 8) * 40}ms` }}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2.5 min-w-0">
        <div className={`flex items-center justify-center size-9 rounded-full text-white text-xs font-bold shrink-0 ${avatarColorClass(row.name)}`}>
          {getInitials(row.name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-display font-bold text-text truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{row.name}</h3>
            <ChevronRight size={13} className="shrink-0 text-text-light opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150" />
          </div>
          <p className="text-[11px] font-display font-medium text-text-muted truncate">{row.role}</p>
        </div>
      </div>

      {/* Same completion ring as DepartmentCard — one person's own record, not the department's.
          Decorative here too — the whole card is this card's navigation trigger. */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <RadialGauge
          percent={row.completionRate ?? 0}
          size={48}
          variant="circle"
          gradientFrom={completionGaugeColor(row.completionRate)}
          gradientTo={completionGaugeColor(row.completionRate)}
        >
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
      <span className="flex items-center gap-2.5 text-xs font-display font-medium text-text-muted">
        <span className="inline-flex items-center gap-1">
          <TicketIcon size={12} className="text-text-light" />
          <strong className="font-display font-bold text-text">{row.openTickets}</strong> tickets
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckSquare size={12} className="text-text-light" />
          <strong className="font-display font-bold text-text">{row.openTasks}</strong> delegations
        </span>
      </span>
      <OverdueBadge count={row.overdue} items={row.overdueItems} />
    </div>
  </div>
);
