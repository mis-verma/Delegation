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
export const ChecklistItemIconTile = ({ icon: Icon, done }: ChecklistItemIconTileProps) => (
  <span className={`flex items-center justify-center size-9 rounded-md shrink-0 ${
    done ? 'bg-primary-500/10 text-primary-600' : 'bg-surface-hover text-text-light'
  }`}>
    <Icon size={16} />
  </span>
);
