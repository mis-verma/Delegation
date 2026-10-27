import { useCallback, useRef, useState, type UIEvent } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExplorerRow } from '../../../../api/scores';
import { Skeleton } from '../../../../components';
import { formatPct, roundPct } from '../../../../lib/percent';
import { CATEGORY_ICON, CATEGORY_TILE } from '../../../dashboard/categoryLook';
import { ToneChip } from '../../../dashboard/ToneChip';
import { TONE_TEXT, toneOf } from '../../../dashboard/scoreTone';
import { MODULE_LABEL } from '../../../../lib/scoreLabels';
import { BI_MODULES, moduleTitle, rowValue, type BiModule } from './biMetrics';
import { ConcentricRings, ScoreRing } from './ScoreRing';

const KEYS: readonly BiModule[] = ['all', ...BI_MODULES];

const RING_COLOR = {
  checklist: 'var(--color-activity-checklist)',
  ticket: 'var(--color-activity-ticket)',
  delegation: 'var(--color-activity-delegation)',
} as const;

const CARD_BASE = 'snap-start shrink-0 basis-[78%] min-[480px]:basis-[46%] sm:basis-auto';

interface ModuleCarouselProps {
  total: ExplorerRow | undefined;
  selected: BiModule;
  onSelect: (module: BiModule) => void;
  updating?: boolean;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ModuleCarousel = ({ total, selected, onSelect, updating = false }: ModuleCarouselProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const max = el.scrollWidth - el.clientWidth;
    setActive(max <= 0 ? 0 : Math.round((el.scrollLeft / max) * (KEYS.length - 1)));
  }, []);

  const goTo = (index: number) => {
    const card = trackRef.current?.children[index] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  };

  const choose = (module: BiModule, index: number) => {
    onSelect(module);
    const card = trackRef.current?.children[index] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  };

  if (!total) {
    return (
      <div className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-4" role="status" aria-label="Loading the module scores">
        {KEYS.map((k) => <Skeleton key={k} className={cn('h-32 rounded-xl', CARD_BASE)} />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        role="group"
        aria-label="Choose a module"
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          'sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0',
          updating && 'opacity-70 transition-opacity',
        )}
      >
        {KEYS.map((key, index) => {
          const isAll = key === 'all';
          const value = isAll ? rowValue(total, 'all', 'score') : rowValue(total, key, 'score');
          const rounded = roundPct(value);
          const tone = toneOf(value);
          const block = isAll ? null : total[key];
          const Icon = isAll ? BarChart3 : CATEGORY_ICON[key];
          const isSelected = selected === key;
          const detail = isAll
            ? `${total.totalDue} ${total.totalDue === 1 ? 'item' : 'items'} due`
            : block && block.due > 0
              ? `${block.done} of ${block.due} done${block.late > 0 ? `, ${block.late} late` : ''}`
              : 'Nothing due';
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${moduleTitle(key)}: ${value === null ? 'nothing due' : formatPct(value)}. ${detail}.`}
              onClick={() => choose(key, index)}
              className={cn(
                CARD_BASE,
                'flex min-h-32 flex-col justify-between gap-3 rounded-xl border bg-surface p-3.5 text-left outline-none transition-colors duration-150 cursor-pointer sm:p-4',
                'focus-visible:ring-2 focus-visible:ring-primary-500/50 active:scale-[0.985]',
                isSelected ? 'border-primary-500/60 ring-2 ring-primary-500/20' : 'border-border hover:border-border-hover',
              )}
            >
              <span className="flex items-center gap-2.5">
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white', isAll ? 'bg-linear-to-br from-primary-500 to-primary-600' : CATEGORY_TILE[key])} aria-hidden="true">
                  <Icon className="size-[1.125rem]" strokeWidth={2.25} />
                </span>
                <span className="t-card font-display font-bold text-text">{moduleTitle(key)}</span>
              </span>
              <span className="flex items-end justify-between gap-2">
                <span className="flex min-w-0 flex-col gap-2">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn('t-figure font-display font-extrabold tabular-nums leading-none', TONE_TEXT[tone])}>
                      {rounded === null ? 'N/A' : formatPct(rounded)}
                    </span>
                    <ToneChip tone={tone} />
                  </span>
                  <span className="t-meta font-medium text-text-muted">{detail}</span>
                </span>
                {isAll ? (
                  <ConcentricRings
                    size={56}
                    values={BI_MODULES.map((m) => ({ key: m, label: MODULE_LABEL[m], value: rowValue(total, m, 'score'), color: RING_COLOR[m] }))}
                  />
                ) : (
                  <ScoreRing value={value} size={52} stroke={6} showValue={false} label={moduleTitle(key)} />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-1 sm:hidden" aria-hidden="false">
        {KEYS.map((key, index) => (
          <button
            key={key}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`Go to ${moduleTitle(key)}`}
            aria-current={active === index}
            className="flex size-6 pointer-coarse:size-9 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 rounded-full"
          >
            <span className={cn('h-1.5 rounded-full transition-all duration-200', active === index ? 'w-5 bg-primary-600' : 'w-1.5 bg-border-hover')} />
          </button>
        ))}
      </div>
    </div>
  );
};
