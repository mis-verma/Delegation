import { memo } from 'react';
import { Link } from 'react-router';
import { Building2, CalendarOff, CircleOff, CirclePower, Hash, MapPin, Store as StoreIcon, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp, ENTITY_CARD_CLASS, EntityIconTile, EntityCardActions, Skeleton, formatWeekdays } from '../../../components';
import type { Store } from '../../../api/stores';
import type { ExplorerRow } from '../../../api/scores';
import { CardChip, ScoreStrip, StatBlock } from '../directory/orgScores';
import { scoresHref } from '../directory/orgScoreData';

interface StoreCardProps {
  store: Store;
  activeCount: number | null | undefined;
  inactiveCount: number;
  departmentCount: number | undefined;
  score: ExplorerRow | null | undefined;
  scoreWindow: { from: string; to: string; failed: boolean };
  isUpdating: boolean;
  isDeleting: boolean;
  onToggleActive: (store: Store) => void;
  onEdit: (store: Store) => void;
  onDelete: (store: Store) => void;
}

export const StoreCard = memo(({
  store, activeCount, inactiveCount, departmentCount, score, scoreWindow,
  isUpdating, isDeleting, onToggleActive, onEdit, onDelete,
}: StoreCardProps) => {
  const href = scoresHref('store', store.id, store.name, scoreWindow.from, scoreWindow.to);
  return (
    <article className={cn(ENTITY_CARD_CLASS, 'justify-start gap-3 hover:border-coral-300', !store.isActive && 'bg-surface-hover/30', (isDeleting || isUpdating) && 'opacity-60 pointer-events-none')}>
      <header className="flex items-start gap-3">
        <EntityIconTile icon={StoreIcon} tone="coral" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="min-w-0">
            <Link
              viewTransition
              to={href}
              title={store.name}
              className={cn(
                'block t-card font-display font-bold leading-snug line-clamp-2 break-words outline-none transition-colors duration-150 group-hover:text-coral-700 dark:group-hover:text-coral-300',
                'after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary-500/50',
                store.isActive ? 'text-text' : 'text-text-secondary',
              )}
            >
              {store.name}
            </Link>
          </h3>
          <p className={cn('flex min-w-0 items-center gap-1 t-meta font-display', store.address ? 'text-text-muted' : 'text-text-light')} title={store.address || undefined}>
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{store.address || 'No address'}</span>
          </p>
        </div>
        <div className="relative z-10 -mr-2 -mt-1">
          <EntityCardActions
            onEdit={() => onEdit(store)}
            onDelete={() => onDelete(store)}
            isDeleting={isDeleting}
            editLabel={`Edit ${store.name}`}
            deleteLabel={`Delete ${store.name}`}
            extraItems={[{ label: store.isActive ? 'Deactivate' : 'Activate', icon: store.isActive ? CircleOff : CirclePower, onClick: () => onToggleActive(store) }]}
          />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <StatBlock
          icon={Users}
          tone="coral"
          label="Staff"
          value={typeof activeCount === 'number' ? <CountUp value={activeCount} fromZero /> : '-'}
          caption={inactiveCount > 0 ? `${inactiveCount} off` : null}
          loading={activeCount === undefined}
        />
        <StatBlock
          icon={Building2}
          tone="primary"
          label={departmentCount === 1 ? 'Department' : 'Departments'}
          value={typeof departmentCount === 'number' ? <CountUp value={departmentCount} fromZero /> : '-'}
          loading={departmentCount === undefined}
        />
      </div>

      {(!!store.code || !!store.weekOffDays?.length || !store.isActive) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {store.code && <CardChip icon={Hash} label={store.code} title={`Store code ${store.code}`} />}
          {!!store.weekOffDays?.length && <CardChip icon={CalendarOff} label={`Off ${formatWeekdays(store.weekOffDays)}`} title="Weekly day off for this store" />}
          {!store.isActive && <CardChip icon={CircleOff} label="Inactive" />}
        </div>
      )}

      <div className="mt-auto">
        <ScoreStrip kind="store" id={store.id} name={store.name} row={score} from={scoreWindow.from} to={scoreWindow.to} failed={scoreWindow.failed} />
      </div>
    </article>
  );
});
StoreCard.displayName = 'StoreCard';

export const StoreCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'justify-start gap-3')} aria-hidden>
    <div className="flex items-start gap-3">
      <Skeleton className="size-10 rounded-xl shrink-0" />
      <div className="flex flex-col gap-1.5 min-w-0 flex-1 max-w-[70%]">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Skeleton className="h-14 rounded-xl" />
      <Skeleton className="h-14 rounded-xl" />
    </div>
    <Skeleton className="h-28 w-full rounded-xl" />
  </div>
);
