import { useRef, type KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExplorerRow } from '../../../../api/scores';
import { Button } from '../../../../components';
import { formatPct, roundPct } from '../../../../lib/percent';
import { MODULE_LABEL, SCORE_LABEL } from '../../../../lib/scoreLabels';
import { getInitials } from '../../../../lib/getInitials';
import { avatarColorClass } from '../../../../lib/avatarColors';
import { TONE_BAR, TONE_TEXT, toneOf } from '../../../dashboard/scoreTone';
import { drillTargets, type DrillTarget } from '../../../scores/scoresDisplay';
import { BI_MODULES, deltaOf, rowDue, rowValue, type BiMeasure, type BiModule } from './biMetrics';
import { DeltaChip } from './DeltaChip';

const rowKey = (row: ExplorerRow) => `${row.kind}:${row.id}`;

const subtitleOf = (row: ExplorerRow, module: BiModule): string => {
  const due = rowDue(row, module);
  const dueText = due === 0 ? 'Nothing due' : `${due} due`;
  if (row.kind === 'person' && row.departmentName) return `${row.departmentName} · ${dueText}`;
  if (row.kind === 'checklist' && row.recurrence) return `${row.recurrence.charAt(0)}${row.recurrence.slice(1).toLowerCase()} · ${dueText}`;
  return dueText;
};

interface TrayProps {
  row: ExplorerRow;
  module: BiModule;
  targets: DrillTarget[];
  onDrill: (row: ExplorerRow, view: DrillTarget['view']) => void;
}

export const Tray = ({ row, module, targets, onDrill }: TrayProps) => {
  const modules = module === 'all' ? BI_MODULES : [module];
  return (
    <div className="flex flex-col gap-3 border-t border-border/60 bg-surface-hover/40 px-3 py-3 sm:px-4">
      <table className="w-full border-collapse t-meta">
        <caption className="sr-only">{row.name}, counts by module</caption>
        <thead>
          <tr>
            <th scope="col" className="sr-only">Module</th>
            {(['due', 'done', 'late', 'notDone', 'open'] as const).map((k) => (
              <th key={k} scope="col" className="py-1 text-right font-display font-semibold text-text-muted">{SCORE_LABEL[k]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const b = row[m];
            return (
              <tr key={m}>
                <th scope="row" className="py-1 pr-2 text-left font-display font-semibold text-text-secondary">{MODULE_LABEL[m]}</th>
                {[b.due, b.done, b.late, b.notDone, b.open].map((n, i) => (
                  <td key={i} className={cn('py-1 text-right tabular-nums', n === 0 ? 'text-text-muted' : 'font-semibold text-text')}>{n}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {targets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {targets.map((t) => (
            <Button key={t.view} type="button" size="sm" variant="outline" onClick={() => onDrill(row, t.view)} className="pointer-coarse:min-h-11">
              {t.label}
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

interface BarRowsProps {
  rows: ExplorerRow[];
  module: BiModule;
  measure: BiMeasure;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onDrill: (row: ExplorerRow, view: DrillTarget['view']) => void;
  onIntent?: (row: ExplorerRow, view: DrillTarget['view']) => void;
  previous?: ReadonlyMap<string, number | null>;
}

export const BarRows = ({ rows, module, measure, selectedKey, onSelect, onDrill, onIntent, previous }: BarRowsProps) => {
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
        const key = rowKey(row);
        const value = rowValue(row, module, measure);
        const rounded = roundPct(value);
        const tone = toneOf(value);
        const targets = drillTargets(row);
        const prior = previous ? previous.get(row.id) ?? null : null;
        const delta = deltaOf(value, prior);
        const open = selectedKey === key;
        const isPerson = row.kind === 'person' || row.kind === 'unassigned';
        const onClick = () => {
          if (open && targets.length > 0) onDrill(row, targets[0].view);
          else onSelect(open ? null : key);
        };
        return (
          <li key={key} className={cn('overflow-hidden rounded-xl border bg-surface transition-colors duration-150', open ? 'border-primary-500/50' : 'border-border/60 hover:border-border-hover')}>
            <button
              type="button"
              data-bar-row
              aria-expanded={open}
              aria-label={`${row.name}: ${rounded === null ? 'nothing due' : formatPct(rounded)}. ${open && targets.length > 0 ? `Press again to ${targets[0].label.toLowerCase()}.` : 'Show details.'}`}
              onClick={onClick}
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
              <ChevronRight className={cn('size-4 shrink-0 text-text-muted transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-90')} aria-hidden="true" />
            </button>
            {open && <Tray row={row} module={module} targets={targets} onDrill={onDrill} />}
          </li>
        );
      })}
    </ul>
  );
};
