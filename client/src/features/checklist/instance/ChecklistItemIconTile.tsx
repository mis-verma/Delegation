import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface ChecklistItemIconTileProps {
  icon: LucideIcon;
  done: boolean;
}

// Shared leading icon tile for the instance item cards, so every item type dims/fills the same way
// once done. rounded-lg steps down from the card's rounded-2xl.
//
// Done state reuses EntityIconTile's own gradient recipe (border only, no shadow — see its own
// comment) instead of a pale flat tint: a page whose whole point is showing progress deserves its
// "this one's done" signal to actually read as a small win.
export const ChecklistItemIconTile = memo(function ChecklistItemIconTile({ icon: Icon, done }: ChecklistItemIconTileProps) {
  return (
    <span className={`flex items-center justify-center size-9 rounded-lg shrink-0 border transition-colors duration-200 ${
      done
        ? 'bg-gradient-to-br from-primary-500 to-primary-700 border-primary-800/20 dark:from-primary-600 dark:to-primary-900 text-white'
        : 'bg-surface-hover border-transparent text-text-light'
    }`}>
      <Icon size={16} strokeWidth={done ? 2.5 : 2} />
    </span>
  );
});
