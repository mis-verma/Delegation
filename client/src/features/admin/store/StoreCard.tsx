import { memo } from 'react';
import { Store as StoreIcon, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ENTITY_CARD_CLASS, EntityIconTile, StatusPill, MetricPill, EntityCardActions, Skeleton } from '../../../components';
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
  <article className={cn(ENTITY_CARD_CLASS, isDeleting && 'opacity-50 pointer-events-none')}>
    <header className="flex items-start justify-between gap-2.5 mb-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <EntityIconTile icon={StoreIcon} tone="coral" />
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3
              className={cn(
                'text-sm font-display font-bold truncate transition-colors duration-150 group-hover:text-primary-600',
                store.isActive ? 'text-text' : 'text-text-secondary'
              )}
              title={store.name}
            >
              {store.name}
            </h3>
            {!store.isActive && (
              <span className="shrink-0 text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md border border-border bg-surface-hover text-text-muted">
                Deactivated
              </span>
            )}
          </div>
          {store.code ? (
            <p className="text-xs font-display text-text-muted truncate">{store.code}</p>
          ) : (
            <p className="text-xs font-display text-text-light italic">No code assigned</p>
          )}
        </div>
      </div>

      <StatusPill
        active={store.isActive}
        isUpdating={isUpdating}
        onToggle={() => onToggleActive(store)}
        ariaLabel={`${store.isActive ? 'Deactivate' : 'Activate'} ${store.name}`}
      />
    </header>

    {store.address && <p className="text-xs text-text-muted mb-2.5 truncate" title={store.address}>{store.address}</p>}

    <footer className="flex items-center justify-between gap-2 pt-2.5 border-t border-border/60 mt-auto">
      {activeCount === undefined ? (
        <Skeleton className="h-6 w-28 rounded-lg" />
      ) : activeCount === null ? (
        <span className="text-xs font-display text-text-light">Count unavailable</span>
      ) : (
        <div title={inactiveCount > 0 ? `${activeCount} active, ${inactiveCount} deactivated` : undefined}>
          <MetricPill icon={Users}>
            {activeCount} {activeCount === 1 ? 'staff member' : 'staff members'}
          </MetricPill>
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
