import { Building2, ChevronRight, Users, AlertTriangle, Ticket as TicketIcon, CheckSquare } from 'lucide-react';
import { useNavigate } from 'react-router';
import { RadialGauge, EntityIconTile } from '../../components';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover';
import { completionGaugeColor } from './teamDisplay';

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
          <p className="text-[11px] font-display font-bold text-text-muted tracking-wider">Overdue</p>
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

export const DepartmentCard = ({ row, onClick, index = 0 }: { row: DepartmentCardRow; onClick: () => void; index?: number }) => (
  // The whole card is the click target now, not just the name — a `div` with a button role, not a
  // real `<button>`, because the overdue badge below is still its own independently-clickable
  // popover trigger and a `<button>` can't contain another `<button>`. Its own `onClick` calls
  // `e.stopPropagation()`, so it still opens the popover instead of also navigating the card.
  <div
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    // Lift on hover (translate, not a box-shadow — this app's cards signal "interactive" with
    // border color + motion, never elevation) plus a staggered entrance so the grid doesn't just
    // snap into place — the same working pattern TodoList.tsx's rows use, capped at 8 steps so a
    // long roster's last card isn't left waiting noticeably longer than the rest.
    className="group flex flex-col gap-3 p-4 rounded-2xl border border-border/60 bg-surface hover:border-primary-300 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
    style={{ animationFillMode: 'backwards', animationDelay: `${Math.min(index, 8) * 40}ms` }}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2.5 min-w-0">
        {/* Same bold gradient tile as the page header and every other EntityIconTile in the app —
            size-9/rounded-lg to match this card's own smaller scale (EntityIconTile defaults to
            size-10/rounded-xl for the bigger Directory/Org Structure cards). Its own
            group-hover:scale-105 now fires from anywhere on the card, not just the tile itself. */}
        <EntityIconTile icon={Building2} className="size-9 rounded-lg" />
        <div className="min-w-0">
          <div className="flex items-start gap-1">
            {/* line-clamp-3, not -2 — on a narrow card the fixed-width completion ring next to
                this leaves too little room per line for a real department name, and 2 lines still
                wasn't enough room for the longest real one ("Inventory & Procurement" truncated
                to "Inventory & Procure…" even wrapped across 2 lines). `title` still covers the
                rare 4th-line overflow for a pointer/hover. */}
            <h3 title={row.name} className="text-sm font-display font-bold text-text line-clamp-3 break-words group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{row.name}</h3>
            <ChevronRight size={13} className="shrink-0 mt-0.5 text-text-light opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150" />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-display font-medium text-text-muted">
            <Users size={11} />
            {row.headcount} {row.headcount === 1 ? 'person' : 'people'}
          </div>
        </div>
      </div>

      {/* Completion ring — the "chart on the card" a plain number list didn't have. Small enough
          to sit in the header without crowding the name, but a real RadialGauge (same component
          the Dashboard's Compliance card uses), not a decorative icon. Decorative here (no click
          of its own) — the whole card is this card's one navigation trigger. Red→amber→green by
          value (completionGaugeColor), matching every other performance-vs-target gauge in the
          app, instead of staying the same flat navy whether the number is 12% or 96%. */}
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
