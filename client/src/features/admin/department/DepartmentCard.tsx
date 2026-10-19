import { memo } from 'react';
import { Link } from 'react-router';
import { Building2, CircleOff, CirclePower, Crown, Store, TriangleAlert, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENTITY_CARD_CLASS, EntityIconTile, EntityCardActions, Skeleton } from '../../../components';
import type { Department } from '../../../api/departments';
import type { ExplorerRow } from '../../../api/scores';
import { CardChip, ScoreStrip } from '../directory/orgScores';
import { scoresHref } from '../directory/orgScoreData';

interface DepartmentCardProps {
  department: Department;
  storeLabel: string | null | undefined;
  activeCount: number | null | undefined;
  inactiveCount: number;
  headName: string | null | undefined;
  score: ExplorerRow | null | undefined;
  scoreWindow: { from: string; to: string; failed: boolean };
  isUpdating: boolean;
  isDeleting: boolean;
  onToggleActive: (department: Department) => void;
  onEdit: (department: Department) => void;
  onDelete: (department: Department) => void;
}

export const DepartmentCard = memo(({
  department, storeLabel, activeCount, inactiveCount, headName, score, scoreWindow,
  isUpdating, isDeleting, onToggleActive, onEdit, onDelete,
}: DepartmentCardProps) => {
  const href = scoresHref('department', department.id, department.name, scoreWindow.from, scoreWindow.to);
  return (
    <article className={cn(ENTITY_CARD_CLASS, 'justify-start gap-3', !department.isActive && 'bg-surface-hover/30', (isDeleting || isUpdating) && 'opacity-60 pointer-events-none')}>
      <header className="flex items-start gap-3">
        <EntityIconTile icon={Building2} tone="primary" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="min-w-0">
            <Link
              viewTransition
              to={href}
              title={department.name}
              className={cn(
                'block t-card font-display font-bold leading-snug line-clamp-2 break-words outline-none transition-colors duration-150 group-hover:text-primary-600 dark:group-hover:text-primary-400',
                'after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary-500/50',
                department.isActive ? 'text-text' : 'text-text-secondary',
              )}
            >
              {department.name}
            </Link>
          </h3>
          {storeLabel === undefined ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <p className={cn('flex min-w-0 items-center gap-1 t-meta font-display', storeLabel ? 'text-text-muted' : 'text-text-light')} title={storeLabel ?? undefined}>
              <Store className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{storeLabel ?? 'No store'}</span>
            </p>
          )}
        </div>
        <div className="relative z-10 -mr-2 -mt-1">
          <EntityCardActions
            onEdit={() => onEdit(department)}
            onDelete={() => onDelete(department)}
            isDeleting={isDeleting}
            editLabel={`Edit ${department.name}`}
            deleteLabel={`Delete ${department.name}`}
            extraItems={[{ label: department.isActive ? 'Deactivate' : 'Activate', icon: department.isActive ? CircleOff : CirclePower, onClick: () => onToggleActive(department) }]}
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {activeCount === undefined ? (
          <Skeleton className="h-5 w-20 rounded-md" />
        ) : activeCount !== null && (
          <CardChip
            icon={Users}
            tone="primary"
            label={`${activeCount} ${activeCount === 1 ? 'member' : 'members'}`}
            title={inactiveCount > 0 ? `${activeCount} active, ${inactiveCount} deactivated` : undefined}
          />
        )}
        {headName === undefined ? null : headName ? (
          <CardChip icon={Crown} label={headName} title={`Head: ${headName}`} />
        ) : department.headOptional ? null : (
          <CardChip icon={TriangleAlert} tone="warning" label="No head" />
        )}
        {!department.isActive && <CardChip icon={CircleOff} label="Inactive" />}
      </div>

      <div className="mt-auto">
        <ScoreStrip kind="department" id={department.id} name={department.name} row={score} from={scoreWindow.from} to={scoreWindow.to} failed={scoreWindow.failed} />
      </div>
    </article>
  );
});
DepartmentCard.displayName = 'DepartmentCard';

export const DepartmentCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'justify-start gap-3')} aria-hidden>
    <div className="flex items-start gap-3">
      <Skeleton className="size-10 rounded-xl shrink-0" />
      <div className="flex flex-col gap-1.5 min-w-0 flex-1 max-w-[70%]">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
    <div className="flex gap-1.5">
      <Skeleton className="h-5 w-20 rounded-md" />
      <Skeleton className="h-5 w-24 rounded-md" />
    </div>
    <Skeleton className="h-12 w-full rounded-xl" />
  </div>
);
