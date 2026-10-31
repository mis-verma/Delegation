import { FigureCard, type FigureTint, type FigureTone } from './FigureCard';

export type StatusKind = 'pending' | 'completed' | 'due' | 'late';

export interface StatusFigureItem<K extends string> {
  key: K;
  kind: StatusKind;
  label: string;
  short?: string;
  help: string;
}

interface StatusFigureStatsProps<K extends string> {
  items: readonly StatusFigureItem<K>[];
  counts: Record<K, number>;
  total?: number;
  active: K | null;
  onToggle: (key: K) => void;
  isLoading?: boolean;
  label: string;
}

const TINT_OF: Record<StatusKind, FigureTint> = { pending: 'sky', completed: 'green', due: 'blue', late: 'red' };

const toneOf = (kind: StatusKind, count: number): FigureTone => {
  if (kind === 'late') return count > 0 ? 'bad' : 'good';
  if (kind === 'completed') return count > 0 ? 'good' : 'plain';
  if (kind === 'pending') return count === 0 ? 'good' : 'plain';
  return 'plain';
};

const share = (count: number, total: number | undefined) => (total && total > 0 ? Math.min(100, (count / total) * 100) : null);

export const StatusFigureStats = <K extends string>({ items, counts, total, active, onToggle, isLoading = false, label }: StatusFigureStatsProps<K>) => (
  <div className="@container grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={label}>
    {items.map((item) => {
      const count = counts[item.key] ?? 0;
      return (
        <FigureCard
          key={item.key}
          label={item.label}
          short={item.short}
          help={item.help}
          value={count}
          tone={toneOf(item.kind, count)}
          tint={TINT_OF[item.kind]}
          bar={share(count, total)}
          loading={isLoading}
          selected={active === item.key}
          onClick={() => onToggle(item.key)}
          compact
        />
      );
    })}
  </div>
);
