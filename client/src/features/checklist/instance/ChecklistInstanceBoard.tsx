import { Clock, AlarmClock, CheckCircle2, Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '../../../components';
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
  mobileOrder: string;
}


const COLUMNS: ColumnConfig[] = [
  { key: 'due', label: 'Due', icon: Clock, dot: 'bg-warning', containerClass: 'border-warning/20 bg-warning/[0.04]', headerText: 'text-warning', mobileOrder: 'order-2' },
  { key: 'overdue', label: 'Overdue', icon: AlarmClock, dot: 'bg-danger', containerClass: 'border-danger/20 bg-danger/[0.04]', headerText: 'text-danger', mobileOrder: 'order-1' },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, dot: 'bg-success', containerClass: 'border-success/20 bg-success/[0.04]', headerText: 'text-success', mobileOrder: 'order-3' },
];

interface ChecklistInstanceBoardProps {
  instances: ChecklistInstance[];
}

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

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-4 items-start animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      {COLUMNS.map((col) => {
        const items = byStatus.get(col.key) ?? [];
        return (
          <div
            key={col.key}
          
            className={`${col.mobileOrder} lg:order-none flex-col gap-2.5 lg:gap-3 lg:rounded-2xl lg:border lg:p-2.5 transition-colors duration-300 ${col.containerClass} max-lg:border-0 max-lg:bg-transparent ${items.length === 0 ? 'hidden lg:flex' : 'flex'}`}
          >
            <div className="flex items-center justify-between px-0.5 lg:px-2 lg:py-1.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative flex items-center justify-center size-2.5 shrink-0">
                  <span className={`absolute inset-0 rounded-full blur-sm opacity-60 max-lg:hidden ${col.dot}`} />
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

            <div className="flex flex-col gap-2.5 lg:gap-3 lg:min-h-40">
              {items.length === 0 ? (
                <EmptyState size="compact" icon={Inbox} title="Nothing here" />
              ) : (
               
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
