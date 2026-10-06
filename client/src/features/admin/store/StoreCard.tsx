import { memo } from 'react';
import { MapPin, Store as StoreIcon, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ENTITY_CARD_CLASS, ColorIconTile, StatusPill, EntityCardActions, Skeleton } from '../../../components';
import type { Store } from '../../../api/stores';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StoreCardProps {
  store: Store;
  /** undefined while the people list is loading, null if it failed; otherwise active people only. */
  activeCount: number | null | undefined;
  inactiveCount: number;
  isUpdating: boolean;
  isDeleting: boolean;
  onToggleActive: (store: Store) => void;
  onEdit: (store: Store) => void;
  onDelete: (store: Store) => void;
}

export const StoreCard = memo(({ store, activeCount, inactiveCount, isUpdating, isDeleting, onToggleActive, onEdit, onDelete }: StoreCardProps) => (
  // justify-start: the footer pins itself with mt-auto, so a taller grid row never spreads the
  // header and footer apart unevenly.
  <article className={cn(ENTITY_CARD_CLASS, 'justify-start gap-3.5', isDeleting && 'opacity-50 pointer-events-none')}>
    <header className="flex items-start justify-between gap-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <ColorIconTile icon={StoreIcon} name={store.name} />
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3
              className={cn(
                'text-sm font-display font-bold truncate transition-colors duration-150 group-hover:text-primary-600 dark:group-hover:text-primary-400',
                store.isActive ? 'text-text' : 'text-text-secondary'
              )}
              title={store.name}
            >
              {store.name}
            </h3>
            {store.code ? (
              <span
                className="shrink-0 max-w-[40%] truncate px-1.5 py-0.5 rounded-md border border-border bg-surface-hover text-xs font-display font-semibold tabular-nums tracking-wide text-text-secondary"
                title={`Store code ${store.code}`}
              >
                {store.code}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-display italic text-text-light">No code</span>
            )}
            {!store.isActive && (
              <span className="shrink-0 text-xs font-display font-bold px-1.5 py-0.5 rounded-md border border-border bg-surface-hover text-text-muted">
                Deactivated
              </span>
            )}
          </div>
          <p
            className={cn('flex items-center gap-1 text-xs font-display min-w-0', store.address ? 'text-text-muted' : 'text-text-light italic')}
            title={store.address || undefined}
          >
            <MapPin className="size-3 shrink-0 text-text-light" aria-hidden />
            <span className="truncate">{store.address || 'No address'}</span>
          </p>
        </div>
      </div>

      <StatusPill
        active={store.isActive}
        isUpdating={isUpdating}
        onToggle={() => onToggleActive(store)}
        ariaLabel={`${store.isActive ? 'Deactivate' : 'Activate'} ${store.name}`}
      />
    </header>

    <footer className="flex items-center justify-between gap-2 pt-3 mt-auto border-t border-border/60 min-h-14">
      {activeCount === undefined ? (
        <Skeleton className="h-6 w-28 rounded-lg" />
      ) : activeCount === null ? (
        <span className="text-xs font-display text-text-light">Count unavailable</span>
      ) : (
        <div className="flex items-center gap-2" title={inactiveCount > 0 ? `${activeCount} active, ${inactiveCount} deactivated` : undefined}>
          <span className="flex items-center justify-center size-7 rounded-lg bg-coral-500/10 dark:bg-coral-500/15 text-coral-700 dark:text-coral-300 shrink-0">
            <Users className="size-3.5" aria-hidden />
          </span>
          <p className="flex items-baseline gap-1.5">
            <span className="text-base font-display font-bold tabular-nums text-text leading-none">{activeCount}</span>
            <span className="text-xs font-display text-text-muted">{activeCount === 1 ? 'staff member' : 'staff members'}</span>
          </p>
        </div>
      )}

      <EntityCardActions
        onEdit={() => onEdit(store)}
        onDelete={() => onDelete(store)}
        isDeleting={isDeleting}
        editLabel={`Edit ${store.name} store`}
        deleteLabel={`Delete ${store.name} store`}
      />
    </footer>
  </article>
));
StoreCard.displayName = 'StoreCard';

// Same chrome and gaps as the card above (header, then a footer that is at least 3.5rem tall), so
// the grid does not jump when the real rows arrive.
export const StoreCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'justify-start gap-3.5')} aria-hidden>
    <div className="flex items-start justify-between gap-2.5">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Skeleton className="size-10 rounded-xl shrink-0" />
        <div className="flex flex-col gap-1.5 min-w-0 flex-1 max-w-[70%]">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-6 w-16 rounded-full shrink-0" />
    </div>
    <div className="flex items-center justify-between gap-2 pt-3 mt-auto border-t border-border/60 min-h-14">
      <Skeleton className="h-6 w-24 rounded-lg" />
      <div className="flex gap-1">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
    </div>
  </div>
);
