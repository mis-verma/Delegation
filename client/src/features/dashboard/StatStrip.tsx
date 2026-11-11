import { memo, type CSSProperties } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatCard } from './StatCard';
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

const BAR = 'after:pointer-events-none after:absolute after:bottom-0 after:rounded-full';

const TILE_CLASS = 'relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center outline-none transition-colors duration-150 first:rounded-l-2xl last:rounded-r-2xl active:bg-surface-hover focus-visible:bg-surface-hover';

interface StatStripProps {
  items: readonly StatStripItem[];
  label: string;
}

export const StatStrip = memo(({ items, label }: StatStripProps) => {
  const warm = usePrefetchRoute();
  const prefetchOf = (href: string) => warm(pathOf(href));

  return (
    <div role="group" aria-label={label}>
      <div className="grid grid-cols-4 divide-x divide-border/50 rounded-2xl bg-surface ring-1 ring-inset ring-border/60 sm:hidden">
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
          const tint = TINT[item.tint];
          const href = item.href;
          return (
            <div
              key={item.key}
              onPointerEnter={href ? () => prefetchOf(href) : undefined}
              onFocusCapture={href ? () => prefetchOf(href) : undefined}
              style={{ '--stat-delay': `${index * 70}ms` } as CSSProperties}
              className="stat-rise flex min-w-0 flex-col [&>*]:flex-1"
            >
              <StatCard
                icon={item.icon}
                label={item.label}
                value={item.failed ? '—' : item.value}
                caption={item.failed ? "Couldn't load" : item.caption}
                href={item.onSelect ? undefined : href}
                onClick={item.onSelect}
                isLoading={item.loading && !item.failed}
                highlight={item.highlight}
                selected={item.selected}
                iconTint={tint.icon}
                valueTone={item.tint === 'danger' && !item.highlight ? 'danger' : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
StatStrip.displayName = 'StatStrip';
