import { memo, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from '../../components/countUp';
import { Skeleton } from '../../components/skeleton';
import { usePrefetchRoute } from '../../lib/routePrefetch';

export type StatTint = 'primary' | 'danger' | 'coral' | 'success';

export interface StatStripItem {
  key: string;
  label: string;
  value: number | string;
  caption: string;
  icon: LucideIcon;
  tint: StatTint;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  controls?: string;
  highlight?: boolean;
  loading?: boolean;
  failed?: boolean;
}

const TINT: Record<StatTint, { icon: string; value: string }> = {
  primary: { icon: 'text-primary-600 dark:text-primary-400', value: 'text-text' },
  danger: { icon: 'text-vivid-red-text', value: 'text-vivid-red-text' },
  coral: { icon: 'text-coral-600 dark:text-coral-400', value: 'text-text' },
  success: { icon: 'text-vivid-green-text', value: 'text-text' },
};

const pathOf = (href: string) => href.split('?')[0] ?? href;

const spoken = (item: StatStripItem) =>
  `${item.label}: ${item.failed ? 'could not load' : item.loading ? 'loading' : item.value}. ${item.caption}`;

const shown = (item: StatStripItem) => (item.failed || item.loading ? '-' : item.value);

const formatCompact = (value: number) =>
  Math.abs(value) < 10_000 ? value.toLocaleString() : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const BAR = 'after:pointer-events-none after:absolute after:bottom-0 after:rounded-full';

const TILE_CLASS = 'relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center outline-none transition-colors duration-150 first:rounded-l-2xl last:rounded-r-2xl active:bg-surface-hover focus-visible:bg-surface-hover';

const CARD_BASE = 'group relative flex min-w-0 flex-col gap-3 rounded-2xl p-5 text-left outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-primary-500/60';

interface StatStripProps {
  items: readonly StatStripItem[];
  label: string;
}

export const StatStrip = memo(({ items, label }: StatStripProps) => {
  const warm = usePrefetchRoute();
  const prefetchOf = (href: string) => warm(pathOf(href));

  return (
    <div role="group" aria-label={label}>
      <div className="grid grid-cols-4 divide-x divide-border/40 rounded-2xl bg-surface-hover/50 sm:hidden">
        {items.map((item) => {
          const Icon = item.icon;
          const tint = TINT[item.tint];
          const inner = (
            <>
              <span className={cn('inline-flex items-center gap-1', tint.icon)}>
                <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
                <span className={cn('t-card font-figure font-extrabold leading-none tabular-nums', tint.value)}>{shown(item)}</span>
              </span>
              <span className="max-w-full truncate t-meta font-medium text-text-muted">{item.label}</span>
            </>
          );
          const href = item.href;
          if (item.onSelect) {
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onSelect}
                aria-expanded={!!item.selected}
                aria-controls={item.controls}
                aria-label={spoken(item)}
                className={cn(TILE_CLASS, 'cursor-pointer', item.selected && cn('bg-primary-500/10 after:inset-x-3 after:h-0.5 after:bg-primary-600 dark:after:bg-primary-400', BAR))}
              >
                {inner}
              </button>
            );
          }
          if (!href) {
            return (
              <div key={item.key} role="group" aria-label={spoken(item)} className={TILE_CLASS}>
                {inner}
              </div>
            );
          }
          return (
            <Link key={item.key} to={href} viewTransition onTouchStart={() => prefetchOf(href)} aria-label={spoken(item)} className={TILE_CLASS}>
              {inner}
            </Link>
          );
        })}
      </div>

      <div className="hidden gap-3 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(min(100%,12.5rem),1fr))] lg:gap-4">
        {items.map((item, index) => {
          const Icon = item.icon;
          const tint = TINT[item.tint];
          const solid = !!item.highlight;
          const interactive = !!item.onSelect || !!item.href;
          const body: ReactNode = (
            <>
              <span className="flex items-center justify-between gap-3">
                <span className={cn('t-meta font-display font-semibold', solid ? 'text-white/75' : 'text-text-muted')}>{item.label}</span>
                <Icon className={cn('size-[1.125rem] shrink-0', solid ? 'text-white/80' : tint.icon)} strokeWidth={2.25} aria-hidden="true" />
              </span>
              {item.loading && !item.failed ? (
                <Skeleton className="h-9 w-20 rounded-md" />
              ) : (
                <span
                  className={cn(
                    't-figure font-figure font-extrabold leading-none tracking-tight tabular-nums',
                    solid ? 'text-white' : item.selected ? 'text-primary-700 dark:text-primary-300' : tint.value,
                  )}
                >
                  {item.failed ? '—' : typeof item.value === 'number' ? <CountUp value={item.value} format={formatCompact} /> : item.value}
                </span>
              )}
              <span className={cn('line-clamp-1 t-meta font-medium', solid ? 'text-white/70' : 'text-text-muted')}>{item.failed ? "Couldn't load" : item.caption}</span>
            </>
          );
          const surface = solid
            ? 'bg-primary-800 text-white hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-500'
            : item.selected
              ? 'bg-primary-500/[0.09]'
              : 'bg-surface-hover/50 hover:bg-surface-hover';
          const cls = cn(
            CARD_BASE,
            'stat-rise',
            surface,
            interactive && 'cursor-pointer active:scale-[0.985]',
            item.selected && cn(BAR, 'after:inset-x-6 after:h-1', solid ? 'after:bg-white/80' : 'after:bg-primary-600 dark:after:bg-primary-400'),
          );
          const style = { '--stat-delay': `${index * 70}ms` } as CSSProperties;
          if (item.onSelect) {
            return (
              <button key={item.key} type="button" onClick={item.onSelect} aria-expanded={!!item.selected} aria-controls={item.controls} aria-label={spoken(item)} style={style} className={cls}>
                {body}
              </button>
            );
          }
          if (item.href) {
            const href = item.href;
            return (
              <Link key={item.key} to={href} viewTransition onPointerEnter={() => prefetchOf(href)} onFocus={() => prefetchOf(href)} aria-label={spoken(item)} style={style} className={cls}>
                {body}
              </Link>
            );
          }
          return (
            <div key={item.key} role="group" aria-label={spoken(item)} style={style} className={cls}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
});
StatStrip.displayName = 'StatStrip';
