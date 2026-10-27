import { cn } from '@/lib/utils';
import type { TodoQuickFilterKey } from './TodoQuickStats';

export type TodoView = 'all' | 'pending' | 'completed';

interface TodoViewTabsProps {
  counts: Record<TodoView, number>;
  filter: TodoQuickFilterKey | null;
  onSelect: (filter: TodoQuickFilterKey | null) => void;
}

const TABS: { view: TodoView; label: string; filter: TodoQuickFilterKey | null }[] = [
  { view: 'all', label: 'All', filter: null },
  { view: 'pending', label: 'Pending', filter: 'pending' },
  { view: 'completed', label: 'Completed', filter: 'completed' },
];

export const TodoViewTabs = ({ counts, filter, onSelect }: TodoViewTabsProps) => (
  <div role="group" aria-label="Show to-dos" className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-surface-hover/50 p-1">
    {TABS.map(({ view, label, filter: target }) => {
      const active = filter === target;
      return (
        <button
          key={view}
          type="button"
          aria-pressed={active}
          onClick={() => onSelect(target)}
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 t-meta font-display font-semibold outline-none transition-colors duration-150 cursor-pointer pointer-coarse:min-h-11',
            'focus-visible:ring-2 focus-visible:ring-primary-500/40',
            active ? 'bg-surface text-text ring-1 ring-border' : 'text-text-muted hover:text-text',
          )}
        >
          {label}
          <span className={cn('tabular-nums', active ? 'text-text-secondary' : 'text-text-muted')}>{counts[view]}</span>
        </button>
      );
    })}
  </div>
);
