import { useId } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExplorerRow } from '../../../../api/scores';
import { InlineError, PANEL_CLASS, Skeleton } from '../../../../components';
import { formatPct, roundPct } from '../../../../lib/percent';
import { CATEGORY_ICON, CATEGORY_TILE } from '../../../dashboard/categoryLook';
import { DashCardHeader } from '../../../dashboard/DashCardHeader';
import { FigureCard } from '../../../dashboard/FigureCard';
import { figureToneOf } from '../../../dashboard/scoreTone';
import { VividChip } from './VividChip';
import { TONE_TEXT, toneOf } from './vivid';
import { MODULE_LABEL, SCORE_LABEL } from '../../../../lib/scoreLabels';
import { BI_MODULES, rowValue, type BiModule } from './biMetrics';
import { ConcentricRings, ScoreRing } from './ScoreRing';

const KEYS: readonly BiModule[] = ['all', ...BI_MODULES];

const RING_COLOR = {
  checklist: 'var(--color-activity-checklist)',
  ticket: 'var(--color-activity-ticket)',
  delegation: 'var(--color-activity-delegation)',
} as const;

interface ModuleCarouselProps {
  total: ExplorerRow | undefined;
  selected: BiModule;
  onSelect: (module: BiModule) => void;
  updating?: boolean;
  periodLabel?: string;
  isError?: boolean;
  onRetry?: () => void;
}

const titleOf = (key: BiModule) => (key === 'all' ? SCORE_LABEL.overall : MODULE_LABEL[key]);
const pctText = (value: number | null) => (roundPct(value) === null ? 'N/A' : formatPct(value));

const detailOf = (total: ExplorerRow, key: BiModule) => {
  if (key === 'all') return total.totalDue === 0 ? 'Nothing due' : `${total.totalDue} ${total.totalDue === 1 ? 'item' : 'items'} due`;
  const block = total[key];
  if (block.due === 0) return 'Nothing due';
  return `${block.done} of ${block.due} done${block.late > 0 ? `, ${block.late} late` : ''}`;
};

export const ModuleCarousel = ({ total, selected, onSelect, updating = false, periodLabel, isError = false, onRetry }: ModuleCarouselProps) => {
  const headingId = useId();

  const body = isError && !total ? (
    <InlineError message="Couldn't load the scores." onRetry={onRetry} />
  ) : !total ? (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" role="status" aria-label="Loading the scores">
      {KEYS.map((k) => (
        <span key={k} className="contents">
          <Skeleton className="h-20 rounded-lg sm:hidden" />
          <Skeleton className="hidden h-36 rounded-xl sm:block" />
        </span>
      ))}
    </div>
  ) : (
    <>
      <div role="group" aria-label="Choose a module" className={cn('grid grid-cols-2 gap-2 sm:hidden', updating && 'opacity-70 transition-opacity')}>
        {KEYS.map((key) => {
          const value = rowValue(total, key, 'score');
          return (
            <FigureCard
              key={key}
              label={titleOf(key)}
              value={roundPct(value)}
              tone={figureToneOf(value)}
              loading={false}
              format={(n) => formatPct(n)}
              caption={detailOf(total, key)}
              onClick={() => onSelect(key)}
              selected={selected === key}
              compact
            />
          );
        })}
      </div>

      <div role="group" aria-label="Choose a module" className={cn('hidden gap-3 sm:grid sm:grid-cols-4', updating && 'opacity-70 transition-opacity')}>
        {KEYS.map((key) => {
          const isAll = key === 'all';
          const value = rowValue(total, key, 'score');
          const tone = toneOf(value);
          const Icon = isAll ? BarChart3 : CATEGORY_ICON[key];
          const isSelected = selected === key;
          const detail = detailOf(total, key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${titleOf(key)}: ${value === null ? 'nothing due' : formatPct(value)}. ${detail}.${isAll ? ` ${BI_MODULES.map((m) => `${MODULE_LABEL[m]} ${pctText(rowValue(total, m, 'score'))}`).join(', ')}.` : ''}`}
              onClick={() => onSelect(key)}
              className={cn(
                'flex min-h-32 flex-col justify-between gap-3 rounded-xl border bg-surface p-4 text-left outline-none transition-colors duration-150 ease-out cursor-pointer',
                'focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.985]',
                isSelected ? 'border-primary-500/60 ring-2 ring-primary-500/20' : 'border-border hover:border-border-hover',
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white', isAll ? 'bg-primary-800' : CATEGORY_TILE[key])} aria-hidden="true">
                  <Icon className="size-[1.125rem]" strokeWidth={2.25} />
                </span>
                <span className="t-card font-display font-bold text-text">{titleOf(key)}</span>
              </span>
              <span className="flex items-end justify-between gap-2">
                <span className="flex min-w-0 flex-col gap-2">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn('t-stat font-display font-extrabold tabular-nums leading-none', TONE_TEXT[tone])}>{pctText(value)}</span>
                    <VividChip tone={tone} />
                  </span>
                  <span className="t-meta font-medium text-text-muted">{detail}</span>
                </span>
                {isAll ? (
                  <ConcentricRings
                    size={56}
                    values={BI_MODULES.map((m) => ({ key: m, label: MODULE_LABEL[m], value: rowValue(total, m, 'score'), color: RING_COLOR[m] }))}
                  />
                ) : (
                  <ScoreRing value={value} size={52} stroke={6} showValue={false} label={titleOf(key)} />
                )}
              </span>
              {isAll && (
                <span className="flex flex-col gap-0.5 border-t border-border/60 pt-2" aria-hidden="true">
                  {BI_MODULES.map((m) => (
                    <span key={m} className="flex items-center justify-between gap-2 t-meta font-medium text-text-secondary">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: RING_COLOR[m] }} />
                        <span className="truncate">{MODULE_LABEL[m]}</span>
                      </span>
                      <span className="tabular-nums font-display font-semibold text-text">{pctText(rowValue(total, m, 'score'))}</span>
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <section aria-labelledby={headingId} className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
      <DashCardHeader
        id={headingId}
        title="Scores"
        action={periodLabel ? <span className="t-meta font-medium text-text-muted tabular-nums">{periodLabel}</span> : undefined}
      />
      <div className="p-4 sm:p-5">{body}</div>
    </section>
  );
};
