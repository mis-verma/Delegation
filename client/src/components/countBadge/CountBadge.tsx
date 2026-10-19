import { cn } from '@/lib/utils';

interface CountBadgeProps {
  count: number;
  max?: number;
  tone?: 'brand' | 'onBrand';
  className?: string;
  label?: string;
}

export const CountBadge = ({ count, max = 9, tone = 'brand', className, label }: CountBadgeProps) => {
  if (count <= 0) return null;
  return (
    <span
      role="img"
      aria-label={label ?? `${count} on`}
      className={cn(
        'inline-flex items-center justify-center shrink-0 h-5 min-w-5 px-1 rounded-full t-meta font-display font-bold leading-none tabular-nums',
        tone === 'brand'
          ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white ring-2 ring-surface dark:from-primary-400 dark:to-primary-600'
          : 'bg-white text-primary-700 ring-2 ring-white/30',
        className,
      )}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
};
