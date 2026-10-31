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

export const ENTITY_CARD_CLASS =
  'group relative flex flex-col justify-between p-4 sm:p-5 bg-surface rounded-2xl border border-border/60 transition-colors duration-150 hover:border-primary-300';

export const PANEL_CLASS = 'bg-surface rounded-2xl border border-border/60';

interface EntityIconTileProps {
  icon: LucideIcon;
  tone?: 'primary' | 'coral';
  className?: string;
  iconClassName?: string;
}

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
  inactiveLabel?: string;
}

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
  onDelete?: () => void;
  isDeleting: boolean;
  editLabel: string;
  deleteLabel?: string;
  onDuplicate?: () => void;
  duplicateLabel?: string;
  extraItems?: DropdownAction[];
}

export const EntityCardActions = ({ onEdit, onDelete, isDeleting, editLabel, deleteLabel, onDuplicate, duplicateLabel, extraItems = [] }: EntityCardActionsProps) => (
  <Dropdown
    align="end"
    items={[
      { label: editLabel, icon: Pencil, onClick: onEdit },
      ...(onDuplicate ? [{ label: duplicateLabel ?? 'Duplicate', icon: Copy, onClick: onDuplicate }] : []),
      ...extraItems,
      ...(onDelete ? [{ label: deleteLabel ?? 'Delete', icon: Trash2, variant: 'destructive' as const, separatorBefore: true, onClick: onDelete }] : []),
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