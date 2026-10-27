import { useRef, type KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExplorerRow } from '../../../../api/scores';
import { formatPct, roundPct } from '../../../../lib/percent';
import { getInitials } from '../../../../lib/getInitials';
import { avatarColorClass } from '../../../../lib/avatarColors';
import { TONE_BAR, TONE_TEXT, toneOf } from '../../../dashboard/scoreTone';
import { drillTargets, type DrillTarget } from '../../../scores/scoresDisplay';
import { deltaOf, rowDue, rowValue, type BiMeasure, type BiModule } from './biMetrics';
import { DeltaChip } from './DeltaChip';

const rowKey = (row: ExplorerRow) => `${row.kind}:${row.id}`;

const subtitleOf = (row: ExplorerRow, module: BiModule): string => {
  const due = rowDue(row, module);
  const dueText = due === 0 ? 'Nothing due' : `${due} due`;
  if (row.kind === 'person' && row.departmentName) return `${row.departmentName} · ${dueText}`;
  if (row.kind === 'checklist' && row.recurrence) return `${row.recurrence.charAt(0)}${row.recurrence.slice(1).toLowerCase()} · ${dueText}`;
  return dueText;
};

interface BarRowsProps {
  rows: ExplorerRow[];
  module: BiModule;
  measure: BiMeasure;
  onOpen: (row: ExplorerRow) => void;
  onIntent?: (row: ExplorerRow, view: DrillTarget['view']) => void;
  previous?: ReadonlyMap<string, number | null>;
}

export const BarRows = ({ rows, module, measure, onOpen, onIntent, previous }: BarRowsProps) => {
  const listRef = useRef<HTMLUListElement>(null);

  const move = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-bar-row]') ?? []);
    const at = buttons.findIndex((b) => b === document.activeElement);
    if (at === -1) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)));
    buttons[next]?.focus();
  };

  return (
    <ul ref={listRef} onKeyDown={move} className="flex flex-col gap-2" aria-label="Scores, one bar per row">
      {rows.map((row) => {
        const value = rowValue(row, module, measure);
        const rounded = roundPct(value);
        const tone = toneOf(value);
        const targets = drillTargets(row);
        const prior = previous ? previous.get(row.id) ?? null : null;
        const delta = deltaOf(value, prior);
        const isPerson = row.kind === 'person' || row.kind === 'unassigned';
        return (
          <li key={rowKey(row)} className="overflow-hidden rounded-xl border border-border/60 bg-surface transition-colors duration-150 hover:border-border-hover">
            <button
              type="button"
              data-bar-row
              aria-haspopup="dialog"
              aria-label={`${row.name}: ${rounded === null ? 'nothing due' : formatPct(rounded)}. Open the details.`}
              onClick={() => onOpen(row)}
              onPointerEnter={() => targets[0] && onIntent?.(row, targets[0].view)}
              onFocus={() => targets[0] && onIntent?.(row, targets[0].view)}
              className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50 sm:px-4"
            >
              {isPerson && (
                <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full t-meta font-display font-bold text-white', avatarColorClass(row.name))}>{getInitials(row.name)}</span>
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex min-w-0 items-baseline justify-between gap-3">
                  <span className="min-w-0 line-clamp-2 t-card font-display font-bold leading-snug text-text">
                    {row.name}
                    {row.left && <span className="ml-1.5 t-meta font-medium text-text-muted">(left)</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <DeltaChip delta={delta} />
                    <span className={cn('t-card font-display font-extrabold tabular-nums', TONE_TEXT[tone])}>
                      {rounded === null ? 'N/A' : formatPct(rounded)}
                    </span>
                  </span>
                </span>
                <span className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
                  <span
                    className={cn('block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none', TONE_BAR[tone])}
                    style={{ width: rounded === null ? '0%' : `${Math.max(rounded, rounded > 0 ? 2 : 0)}%` }}
                  />
                  {prior !== null && (
                    <span className="absolute inset-y-0 w-0.5 bg-text/70" style={{ left: `${Math.min(99.5, Math.max(0, prior))}%` }} title={`Before: ${formatPct(prior)}`} />
                  )}
                </span>
                <span className="line-clamp-1 t-meta font-medium text-text-muted">{subtitleOf(row, module)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
