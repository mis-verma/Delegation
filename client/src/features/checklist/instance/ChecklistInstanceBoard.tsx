import { memo, useMemo } from 'react';
import { Clock, AlarmClock, CheckCircle2, Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '../../../components';
import { ChecklistInstanceCard } from './ChecklistInstanceCard';
import { getInstanceView } from '../checklistDisplay';
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

interface BoardColumnProps {
  col: ColumnConfig;
  items: ChecklistInstance[];
}

// Memoized so a re-render of the page (a filter popover opening, say) doesn't rebuild every card in
// all three columns. `items` only changes identity when the bucketed instances actually change.
const BoardColumn = memo(({ col, items }: BoardColumnProps) => (
  <div
    className={`${col.mobileOrder} lg:order-none flex-col gap-2.5 lg:gap-3 lg:rounded-2xl lg:border lg:p-2.5 transition-colors duration-300 ${col.containerClass} max-lg:border-0 max-lg:bg-transparent ${items.length === 0 ? 'hidden lg:flex' : 'flex'}`}
  >
    <div className="flex items-center justify-between gap-2 px-0.5 lg:px-2 lg:py-1.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`size-2 rounded-full shrink-0 ${col.dot}`} aria-hidden="true" />
        <col.icon size={13} className={`shrink-0 ${col.headerText}`} aria-hidden />
        <h3 className={`text-sm font-display font-bold tracking-wide truncate ${col.headerText}`}>
          {col.label}
        </h3>
      </div>

      <Badge variant="neutral" className="tabular-nums">{items.length}</Badge>
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
));
BoardColumn.displayName = 'BoardColumn';

interface ChecklistInstanceBoardProps {
  instances: ChecklistInstance[];
}

export const ChecklistInstanceBoard = ({ instances }: ChecklistInstanceBoardProps) => {
  const byStatus = useMemo(() => {
    const buckets: Record<BoardStatus, ChecklistInstance[]> = { due: [], overdue: [], completed: [] };
    for (const instance of instances) {
      buckets[getInstanceView(instance).chipStatus].push(instance);
    }
    return buckets;
  }, [instances]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-4 items-start animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      {COLUMNS.map((col) => (
        <BoardColumn key={col.key} col={col} items={byStatus[col.key]} />
      ))}
    </div>
  );
};
