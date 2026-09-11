import { Building2, ChevronRight, Users, AlertTriangle, Ticket as TicketIcon, CheckSquare } from 'lucide-react';
import { useNavigate } from 'react-router';
import { RadialGauge } from '../../components';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover';

/** One overdue ticket or task — enough to list it and jump straight to it. */
export interface OverdueItem {
  id: string;
  title: string;
  link: string;
  kind: 'ticket' | 'task';
}

export interface DepartmentCardRow {
  id: string;
  name: string;
  headcount: number;
  openTickets: number;
  openTasks: number;
  overdue: number;
  overdueItems: OverdueItem[];
  /** Closed tickets + done tasks, over every ticket/task ever raised for this department — `null`
   *  when there's nothing to measure yet (no tickets or tasks at all), same "no data" convention
   *  the Dashboard's Compliance gauges use rather than a misleading 0%/100%. */
  completionRate: number | null;
  completionCount: number;
  completionTotal: number;
}

/** Shared by DepartmentCard and PersonCard — a small popover listing exactly what's overdue,
 *  triggered by the badge itself (not the whole card), so seeing what's overdue doesn't require
 *  drilling into a different screen first. */
export const OverdueBadge = ({ count, items }: { count: number; items: OverdueItem[] }) => {
  const navigate = useNavigate();

  if (count === 0) {
    return (
      <span className="inline-flex items-center justify-center text-[11px] font-display font-bold px-2 py-0.5 rounded bg-surface-hover text-text-muted opacity-70">
        0 overdue
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[11px] font-display font-bold px-2 py-0.5 rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          {count} overdue
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-border/50">
          <AlertTriangle size={13} className="text-danger" />
          <p className="text-[11px] font-display font-bold text-text-muted uppercase tracking-wider">Overdue</p>
        </div>
        <div className="flex flex-col max-h-64 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(item.link); }}
              className="flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-surface-hover transition-colors duration-150 cursor-pointer border-b border-border/30 last:border-b-0"
            >
              {item.kind === 'ticket' ? <TicketIcon size={13} className="shrink-0 text-text-light" /> : <CheckSquare size={13} className="shrink-0 text-text-light" />}
              <span className="text-xs font-display font-medium text-text truncate flex-1">{item.title}</span>
              <ChevronRight size={13} className="shrink-0 text-text-light" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const DepartmentCard = ({ row, onClick }: { row: DepartmentCardRow; onClick: () => void }) => (
  <div className="group flex flex-col gap-3 p-4 rounded-2xl border border-border/60 bg-surface hover:border-primary-300 transition-colors duration-150">
    <div className="flex items-center justify-between gap-2">
      {/* Its own button, not the whole card — the overdue badge below needs to be independently
          clickable (a popover trigger), and a button can't nest inside another button. */}
      <button
        type="button"
        onClick={onClick}
        className="group/info flex items-center gap-2.5 min-w-0 text-left cursor-pointer outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/30"
      >
        <div className="flex items-center justify-center size-9 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400 shrink-0">
          <Building2 size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-display font-bold text-text truncate group-hover/info:text-primary-600 dark:group-hover/info:text-primary-400 transition-colors">{row.name}</h3>
            <ChevronRight size={13} className="shrink-0 text-text-light opacity-0 group-hover/info:opacity-100 group-hover/info:translate-x-0.5 transition-all duration-150" />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-display font-medium text-text-muted">
            <Users size={11} />
            {row.headcount} {row.headcount === 1 ? 'person' : 'people'}
          </div>
        </div>
      </button>

      {/* Completion ring — the "chart on the card" a plain number list didn't have. Small enough
          to sit in the header without crowding the name, but a real RadialGauge (same component
          the Dashboard's Compliance card uses), not a decorative icon. Decorative here (no click
          of its own) — the name button above is this card's one navigation trigger. */}
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
