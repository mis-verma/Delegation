import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SCORE_LABEL_SHORT } from '../../lib/scoreLabels';
import { ScorePct } from './ScorePct';

interface MobileScoreRowProps {
  rank: number | null;
  title: ReactNode;
  overall: number | null;
  cells: { key: string; label: string; value: number | null }[];
  onOpen: () => void;
}

export const MobileScoreRow = memo(({ rank, title, overall, cells, onOpen }: MobileScoreRowProps) => (
  <li>
    <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left outline-none transition-colors duration-150 hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40">
      <span className="flex items-center gap-2">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-hover t-meta font-display font-bold tabular-nums text-text-secondary">{rank ?? '-'}</span>
        <span className="min-w-0 flex-1">{title}</span>
        <span className="flex shrink-0 flex-col items-end leading-tight">
          <span className="t-stat font-display"><ScorePct value={overall} strong /></span>
          <span className="t-meta text-text-muted">{SCORE_LABEL_SHORT.overall}</span>
        </span>
      </span>
      <span className={cn('grid gap-2 border-t border-border/60 pt-2', cells.length > 1 ? 'grid-cols-3' : 'grid-cols-1')}>
        {cells.map((c) => (
          <span key={c.key} className="flex min-w-0 flex-col">
            <span className="t-meta text-text-muted">{c.label}</span>
            <span className="t-card font-display tabular-nums"><ScorePct value={c.value} /></span>
          </span>
        ))}
      </span>
    </button>
  </li>
));
MobileScoreRow.displayName = 'MobileScoreRow';
