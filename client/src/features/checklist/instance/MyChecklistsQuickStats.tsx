import { memo } from 'react';
import { FigureCard, type FigureTone } from '../../dashboard/FigureCard';

export type MyChecklistsQuickFilterKey = 'pending' | 'completed' | 'due' | 'overdue';

export interface MyChecklistsQuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  overdue: number;
}

interface MyChecklistsQuickStatsProps {
  counts: MyChecklistsQuickFilterCounts;
  total?: number;
  active: MyChecklistsQuickFilterKey | null;
  onToggle: (key: MyChecklistsQuickFilterKey) => void;
  onClear?: () => void;
  isLoading?: boolean;
}

const share = (count: number, total: number | undefined) => (total && total > 0 ? Math.min(100, (count / total) * 100) : null);

export const MyChecklistsQuickStats = memo(({ counts, total, active, onToggle, isLoading = false }: MyChecklistsQuickStatsProps) => {
  const missedTone: FigureTone = counts.overdue > 0 ? 'bad' : 'good';
  return (
    <div className="@container grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Checklist figures">
      <FigureCard
        label="Not done"
        help="Checklists you still have to finish. Tap to show only these."
        value={counts.pending}
        tone={counts.pending === 0 ? 'good' : 'plain'}
        bar={share(counts.pending, total)}
        loading={isLoading}
        selected={active === 'pending'}
        onClick={() => onToggle('pending')}
        compact
      />
      <FigureCard
        label="Done today"
        short="Done"
        help="Checklists you finished today. Tap to show only these."
        value={counts.completed}
        tone={counts.completed > 0 ? 'good' : 'plain'}
        bar={share(counts.completed, total)}
        loading={isLoading}
        selected={active === 'completed'}
        onClick={() => onToggle('completed')}
        compact
      />
      <FigureCard
        label="On track"
        help="Checklists still inside their time. Tap to show only these."
        value={counts.due}
        tone={counts.due > 0 ? 'good' : 'plain'}
        bar={share(counts.due, total)}
        loading={isLoading}
        selected={active === 'due'}
        onClick={() => onToggle('due')}
        compact
      />
      <FigureCard
        label="Missed"
        help="Checklists that closed before they were finished. Tap to show only these."
        value={counts.overdue}
        tone={missedTone}
        bar={share(counts.overdue, total)}
        loading={isLoading}
        selected={active === 'overdue'}
        onClick={() => onToggle('overdue')}
        compact
      />
    </div>
  );
});
MyChecklistsQuickStats.displayName = 'MyChecklistsQuickStats';
