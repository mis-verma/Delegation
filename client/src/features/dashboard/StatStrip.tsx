import { memo } from 'react';
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
  href: string;
  highlight?: boolean;
  loading?: boolean;
  failed?: boolean;
}

const TILE_TINT: Record<StatTint, { icon: string; value: string }> = {
  primary: { icon: 'text-primary-600 dark:text-primary-400', value: 'text-text' },
  danger: { icon: 'text-danger', value: 'text-danger' },
  coral: { icon: 'text-coral-600 dark:text-coral-400', value: 'text-text' },
  success: { icon: 'text-success', value: 'text-text' },
};

const CARD_TINT: Record<StatTint, { box: string; icon: string }> = {
  primary: { box: 'bg-primary-500/10', icon: 'text-primary-600 dark:text-primary-400' },
  danger: { box: 'bg-danger/10', icon: 'text-danger' },
  coral: { box: 'bg-coral-500/10', icon: 'text-coral-600 dark:text-coral-400' },
  success: { box: 'bg-success/10', icon: 'text-success' },
};

const pathOf = (href: string) => href.split('?')[0] ?? href;

const shown = (item: StatStripItem) => (item.failed ? '-' : item.loading ? '-' : item.value);

interface StatStripProps {
  items: readonly StatStripItem[];
  label: string;
}

export const StatStrip = memo(({ items, label }: StatStripProps) => {
  const warm = usePrefetchRoute();
  const prefetchOf = (href: string) => warm(pathOf(href));

  return (
    <div role="group" aria-label={label}>
      <div className="grid grid-cols-4 divide-x divide-border/60 rounded-xl border border-border/60 bg-surface sm:hidden">
        {items.map((item) => {
          const Icon = item.icon;
          const tint = TILE_TINT[item.tint];
          return (
            <Link
              key={item.key}
              to={item.href}
              viewTransition
              onTouchStart={() => prefetchOf(item.href)}
              aria-label={`${item.label}: ${item.failed ? 'could not load' : item.loading ? 'loading' : item.value}. ${item.caption}`}
              className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center outline-none transition-colors duration-150 first:rounded-l-xl last:rounded-r-xl active:bg-surface-hover focus-visible:bg-surface-hover"
            >
              <span className={cn('inline-flex items-center gap-1', tint.icon)}>
                <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
                <span className={cn('t-card font-display font-bold leading-none tabular-nums', tint.value)}>{shown(item)}</span>
              </span>
              <span className="max-w-full truncate t-meta font-medium text-text-muted">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {items.map((item) => {
          const tint = CARD_TINT[item.tint];
          return (
            <div key={item.key} onPointerEnter={() => prefetchOf(item.href)} onFocusCapture={() => prefetchOf(item.href)} className="contents">
              <StatCard
                icon={item.icon}
                label={item.label}
                value={item.failed ? '—' : item.value}
                caption={item.failed ? "Couldn't load" : item.caption}
                href={item.href}
                isLoading={item.loading && !item.failed}
                highlight={item.highlight}
                decorative={item.highlight}
                iconBgTint={item.highlight ? undefined : tint.box}
                iconTint={item.highlight ? undefined : tint.icon}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
StatStrip.displayName = 'StatStrip';
