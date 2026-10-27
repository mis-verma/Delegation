import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import type { ExplorerRow } from '../../../../api/scores';
import { formatPct, roundPct } from '../../../../lib/percent';
import { getInitials } from '../../../../lib/getInitials';
import { avatarColorClass } from '../../../../lib/avatarColors';
import { drillTargets, type DrillTarget } from '../../../scores/scoresDisplay';
import { Tray } from './BarRows';
import { deltaOf, rowDue, rowValue, type BiMeasure, type BiModule } from './biMetrics';
import { DeltaChip } from './DeltaChip';
import { ScoreRing } from './ScoreRing';

const rowKey = (row: ExplorerRow) => `${row.kind}:${row.id}`;

interface RingGridProps {
  rows: ExplorerRow[];
  module: BiModule;
  measure: BiMeasure;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onDrill: (row: ExplorerRow, view: DrillTarget['view']) => void;
  onIntent?: (row: ExplorerRow, view: DrillTarget['view']) => void;
  previous?: ReadonlyMap<string, number | null>;
}

export const RingGrid = ({ rows, module, measure, selectedKey, onSelect, onDrill, onIntent, previous }: RingGridProps) => {
  const listRef = useRef<HTMLUListElement>(null);
  const selected = rows.find((r) => rowKey(r) === selectedKey) ?? null;

  const move = (e: KeyboardEvent<HTMLUListElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-ring]') ?? []);
    const at = buttons.findIndex((b) => b === document.activeElement);
    if (at === -1) return;
    e.preventDefault();
    const columns = Math.max(1, Math.round((listRef.current?.clientWidth ?? 1) / (buttons[0]?.offsetWidth ?? 1)));
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? columns : e.key === 'ArrowUp' ? -columns : 0;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, at + step));
    buttons[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <ul ref={listRef} onKeyDown={move} aria-label="Scores, one ring per row" className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {rows.map((row) => {
          const key = rowKey(row);
          const value = rowValue(row, module, measure);
          const targets = drillTargets(row);
          const open = selectedKey === key;
          const delta = deltaOf(value, previous ? previous.get(row.id) ?? null : null);
          const isPerson = row.kind === 'person' || row.kind === 'unassigned';
          const due = rowDue(row, module);
          return (
            <li key={key}>
              <button
                type="button"
                data-ring
                aria-pressed={open}
                aria-label={`${row.name}: ${roundPct(value) === null ? 'nothing due' : formatPct(value)}. ${open && targets.length > 0 ? `Press again to ${targets[0].label.toLowerCase()}.` : 'Show details.'}`}
                onClick={() => (open && targets.length > 0 ? onDrill(row, targets[0].view) : onSelect(open ? null : key))}
                onPointerEnter={() => targets[0] && onIntent?.(row, targets[0].view)}
                onFocus={() => targets[0] && onIntent?.(row, targets[0].view)}
                className={cn(
                  'flex min-h-40 w-full flex-col items-center justify-start gap-2 rounded-xl border bg-surface px-2 py-3 text-center outline-none transition-colors duration-150 cursor-pointer active:scale-[0.985]',
                  'focus-visible:ring-2 focus-visible:ring-primary-500/50',
                  open ? 'border-primary-500/60 ring-2 ring-primary-500/20' : 'border-border/60 hover:border-border-hover',
                )}
              >
                <ScoreRing value={value} size={76} stroke={8} label={row.name} />
                <span className="flex min-w-0 max-w-full items-center gap-1.5">
                  {isPerson && (
                    <span aria-hidden="true" className={cn('flex size-6 shrink-0 items-center justify-center rounded-full t-meta font-display font-bold text-white', avatarColorClass(row.name))}>{getInitials(row.name)}</span>
                  )}
                  <span className="line-clamp-2 t-card font-display font-bold leading-snug text-text">{row.name}</span>
                </span>
                <span className="t-meta font-medium text-text-muted">{due === 0 ? 'Nothing due' : `${due} due`}</span>
                <DeltaChip delta={delta} />
              </button>
            </li>
          );
        })}
      </ul>
      {selected && (
        <div className="overflow-hidden rounded-xl border border-primary-500/40">
          <p className="px-3 pt-3 t-card font-display font-bold text-text sm:px-4">{selected.name}</p>
          <Tray row={selected} module={module} targets={drillTargets(selected)} onDrill={onDrill} />
        </div>
      )}
    </div>
  );
};
