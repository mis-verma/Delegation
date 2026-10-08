import type { LucideIcon } from 'lucide-react';
import { Pencil, Copy, Trash2, MoreVertical } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader } from '../loaders/Loader';
import { Switch } from '../switch';
import { Dropdown } from '../dropdown';
import { Skeleton } from '../skeleton';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

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

// Loading placeholder shaped exactly like a real Users/Departments/Stores card (ENTITY_CARD_CLASS's
// own padding/radius/border, not a hand-drifted approximation) — the three lists used to each
// define their own skeleton with a different padding/height that didn't quite match the card that
// would replace it, causing a visible layout jump the instant real data arrived.
export const EntityCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'gap-2.5')}>
    <div className="flex items-start justify-between gap-2.5 mb-2.5">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <Skeleton className="size-10 rounded-xl shrink-0" />
        <div className="space-y-1.5 flex-1 min-w-0 max-w-[70%]">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-6 w-16 rounded-full shrink-0" />
    </div>
    <div className="flex items-center justify-between pt-2.5 border-t border-border/60 mt-auto">
      <Skeleton className="h-6 w-20 rounded-lg" />
      <div className="flex gap-1">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
    </div>
  </div>
);

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
    <span className={cn('text-xs font-display font-semibold', active ? 'text-text-secondary' : 'text-text-muted')}>
      {active ? 'Active' : inactiveLabel}
    </span>
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

interface MetricPillProps {
  icon: LucideIcon;
  children: React.ReactNode;
}

export const MetricPill = ({ icon: Icon, children }: MetricPillProps) => (
  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-hover text-text-secondary text-[0.6875rem] font-semibold tracking-wide border border-border transition-colors duration-200 group-hover:bg-surface-active/50 group-hover:border-border-hover">
    <Icon className="size-3.5 text-text-light shrink-0" strokeWidth={2.5} />
    <span>{children}</span>
  </div>
);

export type EntityStatusFilterValue = 'all' | 'active' | 'inactive';

interface EntityStatusFilterProps {
  value: EntityStatusFilterValue;
  onChange: (value: EntityStatusFilterValue) => void;
  counts: { all: number; active: number; inactive: number };
  /** Word for the third segment. Users say "Deactivated"; Departments and Stores keep "Inactive". */
  inactiveLabel?: string;
}

// Shared "who's active, who's isn't" segmented filter for the Users/Departments/Stores lists —
// a plain running count used to say how many rows existed, with no way to see the active/inactive
// split without opening each card individually.
//
// Built on the same Tabs primitive as the Users/Departments/Stores entity-type switcher above it
// (DirectoryPage.tsx) rather than a hand-rolled lookalike — this used to fill its selected pill
// solid navy, the exact same treatment DirectoryPage gives its own (primary-level) tabs, so two
// unrelated controls stacked directly on top of each other read as one repeated widget with no
// hierarchy between "which entity type" and "which status". Tabs' own default selected style (a
// light bg-surface chip) reads as clearly secondary next to that bolder navy row.
export const EntityStatusFilter = ({ value, onChange, counts, inactiveLabel = 'Inactive' }: EntityStatusFilterProps) => (
  <Tabs value={value} onValueChange={(v) => onChange(v as EntityStatusFilterValue)}>
    <TabsList className="rounded-full p-1 gap-1 h-auto w-fit">
      {([
        { key: 'all' as const, label: 'All' },
        { key: 'active' as const, label: 'Active' },
        { key: 'inactive' as const, label: inactiveLabel },
      ]).map(({ key, label }) => (
        <TabsTrigger key={key} value={key} className="gap-2 min-h-11 sm:min-h-8 px-3 py-1.5 rounded-full font-display font-bold">
          {label}
          <span className={cn('text-[0.625rem] font-semibold tabular-nums', value === key ? 'text-text-secondary' : 'text-text-light')}>
            {counts[key]}
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

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
}
  
// One "more actions" menu instead of a row of pencil, copy and trash icons: Edit, Duplicate (when the
// thing can be copied) and Delete (red, after a divider). 44px target on touch, 36px with a mouse.
export const EntityCardActions = ({ onEdit, onDelete, isDeleting, editLabel, deleteLabel, onDuplicate, duplicateLabel }: EntityCardActionsProps) => (
  <Dropdown
    align="end"
    items={[
      { label: editLabel, icon: Pencil, onClick: onEdit },
      ...(onDuplicate ? [{ label: duplicateLabel ?? 'Duplicate', icon: Copy, onClick: onDuplicate }] : []),
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