import type { LucideIcon } from 'lucide-react';
import { StateChip } from '../stateChip';
import { Pencil, Copy, Trash2, MoreVertical } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader } from '../loaders/Loader';
import { Switch } from '../switch';
import { Dropdown, type DropdownAction } from '../dropdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Shared visual language for the Users / Departments / Stores cards — one definition so the
// three entity types read as one design system instead of three hand-drifted lookalikes.

export const ENTITY_CARD_CLASS =
  'group relative flex flex-col justify-between p-4 sm:p-5 bg-surface rounded-2xl border border-border/60 transition-colors duration-150 hover:border-primary-300';

// The same card chrome without the hover and padding: for static panels, headers, tiles and item cards
// that sit next to entity cards, so every surface shares one radius and border.
export const PANEL_CLASS = 'bg-surface rounded-2xl border border-border/60';

interface EntityIconTileProps {
  icon: LucideIcon;
  /** primary (navy) for org structure — users, departments; coral (gold) for physical stores. */
  tone?: 'primary' | 'coral';
  className?: string;
  /** Glyph size classes; defaults to `size-5` (for the 40px tile). Pass a smaller one when the tile
   *  itself is shrunk via `className`. */
  iconClassName?: string;
}

// The leading visual for Departments/Stores — exactly 40px to match User avatars. A solid
// gradient fill with a white icon, not the pale tint-on-white this used to be — one shared, bolder
// recipe used everywhere an icon tile appears (this, the Dashboard's section headers, Quick
// Actions) so "the app feels dull/flat" gets fixed once, consistently, rather than per screen.
// Still just a border for edge definition, no box-shadow — the app's own "cards use borders, not
// shadows" convention extends to this tile too.
export const EntityIconTile = ({ icon: Icon, tone = 'primary', className, iconClassName = 'size-5' }: EntityIconTileProps) => (
  <div
    className={cn(
      'flex items-center justify-center size-10 rounded-xl shrink-0 text-white transition-all duration-300 group-hover:scale-105',
      tone === 'coral'
        ? 'bg-gradient-to-br from-coral-400 to-coral-600 border border-coral-700/20 dark:from-coral-500 dark:to-coral-700'
        : 'bg-gradient-to-br from-primary-500 to-primary-700 border border-primary-800/20 dark:from-primary-600 dark:to-primary-900',
      className
    )}
  >
    <Icon className={iconClassName} strokeWidth={2.25} />
  </div>
);

interface StatusPillProps {
  active: boolean;
  isUpdating: boolean;
  onToggle: () => void;
  ariaLabel: string;
  /** Word for the off state. Users say "Deactivated"; Departments and Stores keep "Inactive". */
  inactiveLabel?: string;
}

// The Active/Inactive control on the Department and Store cards and rows: a real switch with its
// state spelled out beside it (the old dot pill read as a label, not something you can press).
export const StatusPill = ({ active, isUpdating, onToggle, ariaLabel, inactiveLabel = 'Inactive' }: StatusPillProps) => (
  <label className="flex items-center gap-2 min-h-11 sm:min-h-9 shrink-0 cursor-pointer">
    <StateChip active={active} label={active ? 'Active' : inactiveLabel} />
    {isUpdating ? (
      <span className="flex h-6 w-11 items-center justify-center">
        <Loader size="sm" variant="slate" className="size-4" />
      </span>
    ) : (
      <Switch checked={active} onChange={() => onToggle()} />
    )}
    <span className="sr-only">{ariaLabel}</span>
  </label>
);

export type EntityStatusFilterValue = 'all' | 'active' | 'inactive';

interface EntityCardActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  editLabel: string;
  deleteLabel: string;
  /** Adds a copy button between edit and delete — only the cards whose thing can be duplicated
   *  (checklists) pass these; Users/Departments/Stores leave them out and look exactly as before. */
  onDuplicate?: () => void;
  duplicateLabel?: string;
  /** Extra items between Edit and Delete, e.g. Deactivate on the Departments and Stores cards. */
  extraItems?: DropdownAction[];
}

// One "more actions" menu instead of a row of pencil, copy and trash icons: Edit, Duplicate (when the
// thing can be copied) and Delete (red, after a divider). 44px target on touch, 36px with a mouse.
export const EntityCardActions = ({ onEdit, onDelete, isDeleting, editLabel, deleteLabel, onDuplicate, duplicateLabel, extraItems = [] }: EntityCardActionsProps) => (
  <Dropdown
    align="end"
    items={[
      { label: editLabel, icon: Pencil, onClick: onEdit },
      ...(onDuplicate ? [{ label: duplicateLabel ?? 'Duplicate', icon: Copy, onClick: onDuplicate }] : []),
      ...extraItems,
      { label: deleteLabel, icon: Trash2, variant: 'destructive' as const, separatorBefore: true, onClick: onDelete },
    ]}
    trigger={
      <button
        type="button"
        disabled={isDeleting}
        aria-label={`More actions: ${editLabel}`}
        className="flex items-center justify-center size-11 sm:size-9 shrink-0 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isDeleting ? <Loader size="sm" variant="rose" className="size-4" /> : <MoreVertical className="size-4" strokeWidth={2.25} aria-hidden />}
      </button>
    }
  />
);