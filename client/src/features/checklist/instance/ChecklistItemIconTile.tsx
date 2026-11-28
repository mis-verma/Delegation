import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface ChecklistItemIconTileProps {
  icon: LucideIcon;
  done: boolean;
  /** Phones show the question number instead of the type icon; the tile colour already says done. */
  number?: number;
}

export const ChecklistItemIconTile = memo(function ChecklistItemIconTile({ icon: Icon, done, number }: ChecklistItemIconTileProps) {
  const iconClass = 'size-[18px]';
  return (
    <span className={`flex items-center justify-center size-9 rounded-lg shrink-0 border transition-colors duration-200 ${
      done
        ? 'bg-primary-800 border-primary-800/20 dark:from-primary-600 dark:to-primary-900 text-white'
        : 'bg-surface-hover border-transparent text-text-light'
    }`}>
      {number === undefined ? (
        <Icon className={iconClass} strokeWidth={done ? 2.5 : 2} />
      ) : (
        <>
          <span className="t-card font-display font-bold tabular-nums sm:hidden" aria-hidden="true">{number}</span>
          <Icon className={`${iconClass} hidden sm:block`} strokeWidth={done ? 2.5 : 2} />
        </>
      )}
    </span>
  );
});
