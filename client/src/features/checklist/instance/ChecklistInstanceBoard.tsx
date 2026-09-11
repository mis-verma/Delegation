import { Clock, AlarmClock, CheckCircle2, Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ChecklistInstanceCard } from './ChecklistInstanceCard';
import { isInstanceOverdue } from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

type BoardStatus = 'due' | 'overdue' | 'completed';

interface ColumnConfig {
  key: BoardStatus;
  label: string;
  icon: LucideIcon;
  dot: string;
  containerClass: string;
  headerText: string;
}

// Same tone convention as statusTiles.ts (warning=Due, danger=Overdue, success=Completed) — the
// board's columns read as the same three buckets the Table view's Status column and the quick-stat
// tiles already use, just laid out spatially instead of as a list.
const COLUMNS: ColumnConfig[] = [
  { key: 'due', label: 'Due', icon: Clock, dot: 'bg-warning', containerClass: 'border-warning/20 bg-warning/[0.04]', headerText: 'text-warning' },
  { key: 'overdue', label: 'Overdue', icon: AlarmClock, dot: 'bg-danger', containerClass: 'border-danger/20 bg-danger/[0.04]', headerText: 'text-danger' },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, dot: 'bg-success', containerClass: 'border-success/20 bg-success/[0.04]', headerText: 'text-success' },
];

interface ChecklistInstanceBoardProps {
  instances: ChecklistInstance[];
}

// Read-only status board — the Board-view sibling of MyChecklists' List/Table, styled after
// TicketBoardColumn's swimlane treatment (tinted rounded container, glowing status dot, shadowed
// count pill) so a checklist board reads as the same "board" pattern as Ticket/Delegation's,
// just without drag: a checklist's status is derived from ticking off its own items, not
// something you manually move between columns. Click a card to open and act on it, same as List.
export const ChecklistInstanceBoard = ({ instances }: ChecklistInstanceBoardProps) => {
  const byStatus = new Map<BoardStatus, ChecklistInstance[]>(COLUMNS.map((c) => [c.key, []]));
  for (const instance of instances) {
    const total = instance.items.length;
    const done = instance.items.filter((i) => i.isDone).length;
    const isComplete = total > 0 && done === total;
    const overdue = isInstanceOverdue(instance, isComplete);
    const status: BoardStatus = isComplete ? 'completed' : overdue ? 'overdue' : 'due';
    byStatus.get(status)!.push(instance);
  }

  return (
    <div className="flex lg:grid lg:grid-cols-3 gap-4 items-start overflow-x-auto lg:overflow-visible snap-x snap-mandatory lg:snap-none pb-2 lg:pb-0 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      {COLUMNS.map((col) => {
        const items = byStatus.get(col.key) ?? [];
        return (
          <div
            key={col.key}
            className={`flex-1 min-w-[280px] sm:min-w-[320px] lg:min-w-0 snap-start flex flex-col gap-3 rounded-2xl border p-2.5 transition-colors duration-300 ${col.containerClass}`}
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative flex items-center justify-center size-2.5 shrink-0">
                  <span className={`absolute inset-0 rounded-full blur-sm opacity-60 ${col.dot}`} />
                  <span className={`relative size-2 rounded-full shrink-0 ${col.dot}`} aria-hidden="true" />
                </div>
                <col.icon size={13} className={`shrink-0 ${col.headerText}`} />
                <h3 className={`text-[13px] font-display font-bold tracking-wide truncate ${col.headerText}`}>
                  {col.label}
                </h3>
              </div>

              <span className="flex items-center justify-center min-w-[1.75rem] h-6 px-2 text-[11px] font-bold text-text-secondary rounded-full bg-surface border border-border/50 shadow-sm tabular-nums shrink-0">
                {items.length}
              </span>
            </div>

            <div className="flex flex-col gap-3 min-h-40">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-28 px-4 text-center border-2 border-dashed border-border/40 rounded-xl bg-surface/30 text-text-muted/70 transition-all duration-300">
                  <div className="p-2 rounded-full bg-surface-hover/60 mb-2 shadow-inner">
                    <Inbox size={14} className="text-text-muted/50" />
                  </div>
                  <span className="text-[11px] font-medium text-text-muted/70">Nothing here</span>
                </div>
              ) : (
                // The card handles its own hover treatment (border-color change, no shadow/lift —
                // this app's house rule against shadow-as-elevation on card/row containers), so
                // this no longer needs its own shadow+lift wrapper on top of it.
                items.map((instance) => (
                  <ChecklistInstanceCard key={instance.id} instance={instance} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
