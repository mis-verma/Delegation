import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface ChecklistItemIconTileProps {
  icon: LucideIcon;
  done: boolean;
}

export const ChecklistItemIconTile = memo(function ChecklistItemIconTile({ icon: Icon, done }: ChecklistItemIconTileProps) {
  return (
    <span className={`flex items-center justify-center size-9 rounded-lg shrink-0 border transition-colors duration-200 ${
      done
        ? 'bg-gradient-to-br from-primary-500 to-primary-700 border-primary-800/20 dark:from-primary-600 dark:to-primary-900 text-white'
        : 'bg-surface-hover border-transparent text-text-light'
    }`}>
      <Icon className="size-[18px]" strokeWidth={done ? 2.5 : 2} />
    </span>
  );
});
