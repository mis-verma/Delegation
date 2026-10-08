import { cn } from '@/lib/utils';

interface CountBadgeProps {
  count: number;
  /** Over this many it reads "9+" so a wide number never stretches a button. */
  max?: number;
  /** Sits on a solid brand button (white ring on a tinted disc) or on a plain surface. */
  tone?: 'brand' | 'onBrand';
  className?: string;
  /** Spoken label, e.g. "3 filters on". */
  label?: string;
}

/**
 * The little round number on a Filters or Options button: how many are switched on. One look
 * everywhere: a brand gradient disc with a ring in the surface colour, so it stays crisp on any
 * button and in dark mode. `onBrand` flips it to a white disc for a button that is already filled.
 */
export const CountBadge = ({ count, max = 9, tone = 'brand', className, label }: CountBadgeProps) => {
  if (count <= 0) return null;
  return (
    <span
      role="img"
      aria-label={label ?? `${count} on`}
      className={cn(
        'inline-flex items-center justify-center shrink-0 h-5 min-w-5 px-1 rounded-full text-[0.6875rem] font-display font-bold leading-none tabular-nums',
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
