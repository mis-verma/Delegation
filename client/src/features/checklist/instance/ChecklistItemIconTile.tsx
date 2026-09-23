import type { LucideIcon } from 'lucide-react';

interface ChecklistItemIconTileProps {
  icon: LucideIcon;
  done: boolean;
}

// Shared leading icon tile for the 13 instance item cards — was a three-way split (EntityIconTile
// at rounded-xl/size-10 on 9 cards, a hand-rolled rounded-lg/size-9 tint-on-done span on 4 others),
// which meant the icon sat at a LARGER radius than its own rounded-lg card on 9 of them (inverted
// nesting) and only half the cards visually signaled completion via this tile at all. One
// definition fixes both: rounded-md steps down correctly from the card's rounded-lg, and every
// item type now dims/fills the same way once done.
//
// Done state reuses EntityIconTile's own gradient recipe (border only, no shadow — see its own
// comment) instead of a pale flat tint: a page whose whole point is showing progress deserves its
// "this one's done" signal to actually read as a small win, not the same washed-out blue every
// other "selected" chip in the app already moved away from.
export const ChecklistItemIconTile = ({ icon: Icon, done }: ChecklistItemIconTileProps) => (
  <span className={`flex items-center justify-center size-9 rounded-md shrink-0 border transition-colors duration-200 ${
    done
      ? 'bg-gradient-to-br from-primary-500 to-primary-700 border-primary-800/20 dark:from-primary-600 dark:to-primary-900 text-white'
      : 'bg-surface-hover border-transparent text-text-light'
  }`}>
    <Icon size={16} strokeWidth={done ? 2.5 : 2} />
  </span>
);
