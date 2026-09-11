import { Store as StoreIcon, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ENTITY_CARD_CLASS, EntityIconTile, StatusPill, MetricPill, EntityCardActions } from '../../../components';
import type { Store } from '../../../api/stores';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StoreCardProps {
  store: Store;
  memberCount: number;
  isUpdating: boolean;
  isDeleting: boolean;
  onToggleActive: (id: string, isActive: boolean) => void;
  onEdit: (store: Store) => void;
  onDelete: (id: string) => void;
}

export const StoreCard = ({ store, memberCount, isUpdating, isDeleting, onToggleActive, onEdit, onDelete }: StoreCardProps) => (
  <article
    className={cn(
      ENTITY_CARD_CLASS,
      // Inactive stores read as visibly muted, not just via the small text pill, so a scan of the
      // grid shows who's active/inactive at a glance.
      !store.isActive && 'opacity-65 saturate-50',
      isDeleting && 'opacity-50 pointer-events-none grayscale-[0.3]'
    )}
  >
    <header className="flex items-start justify-between gap-2.5 mb-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <EntityIconTile icon={StoreIcon} tone="coral" />
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-display font-bold text-text truncate group-hover:text-primary-600 transition-colors duration-300" title={store.name}>
            {store.name}
          </h3>
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
        onToggle={() => onToggleActive(store.id, store.isActive)}
        ariaLabel={`${store.isActive ? 'Deactivate' : 'Activate'} ${store.name}`}
      />
    </header>

    {store.address && <p className="text-xs text-text-muted mb-2.5 truncate">{store.address}</p>}

    <footer className="flex items-center justify-between pt-2.5 border-t border-border/60 mt-auto">
      <MetricPill icon={Users}>
        {memberCount} {memberCount === 1 ? 'staff member' : 'staff members'}
      </MetricPill>

      <EntityCardActions
        onEdit={() => onEdit(store)}
        onDelete={() => onDelete(store.id)}
        isDeleting={isDeleting}
        editLabel={`Edit ${store.name} store`}
        deleteLabel={`Delete ${store.name} store`}
      />
    </footer>
  </article>
);
