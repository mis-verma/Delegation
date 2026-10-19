import { memo, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, CircleOff, Hash, Layers, Store as StoreIcon, Users as UsersIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { EntityIconTile, AvatarStack } from '../../../components';
import { CardChip, ScorePill } from '../directory/orgScores';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { OrgMovePatch, StoreNode } from './orgStructureDisplay';
import { fullName, isLeavingDropTarget, readDraggedUser } from './orgStructureDisplay';
import { DepartmentSection } from './DepartmentSection';
import { UserRow } from './UserRow';
import { TreeItem, TreeList } from './TreeBranch';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StoreSectionProps {
  node: StoreNode;
  isOpen: boolean;
  forceOpen: boolean;
  onToggle: (id: string) => void;
  isDeptOpen: (id: string) => boolean;
  onToggleDept: (id: string) => void;
  onDropUser?: (userId: string, patch: OrgMovePatch) => void;
  onUserDragStart?: (user: StoreNode['directUsers'][number]) => void;
  onUserDragEnd?: () => void;
}

const StoreSectionComponent = ({
  node,
  isOpen,
  forceOpen,
  onToggle,
  isDeptOpen,
  onToggleDept,
  onDropUser,
  onUserDragStart,
  onUserDragEnd,
}: StoreSectionProps) => {
  const open = isOpen || forceOpen;
  const panelId = useId();
  const [isDropTarget, setIsDropTarget] = useState(false);
  const people = useMemo(
    () =>
      [...node.directUsers, ...node.departments.flatMap((d) => d.users)]
        .filter((u) => u.isActive)
        .map((u) => ({ name: fullName(u), src: resolveAvatarUrl(u.avatarUrl) })),
    [node.directUsers, node.departments]
  );

  return (
    <div
      onDragOver={(e) => {
        if (!onDropUser) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={(e) => {
        if (!onDropUser) return;
        setIsDropTarget(!(e.target as Element).closest('[data-org-dept]'));
      }}
      onDragLeave={(e) => {
        if (onDropUser && isLeavingDropTarget(e)) setIsDropTarget(false);
      }}
      onDrop={(e) => {
        if (!onDropUser) return;
        e.preventDefault();
        setIsDropTarget(false);
        const dragged = readDraggedUser(e);
        if (!dragged || (dragged.departmentId === null && dragged.storeId === node.store.id)) return;
        onDropUser(dragged.id, { departmentId: null, storeId: node.store.id });
      }}
      className={cn(
        'group/store rounded-2xl border overflow-hidden transition-colors duration-200',
        isDropTarget
          ? 'border-coral-400 bg-coral-500/10 dark:bg-coral-500/15 outline outline-2 -outline-offset-2 outline-coral-500/40'
          : 'border-border bg-surface hover:border-coral-300'
      )}
    >
      <div className="relative">
        <button
          type="button"
          onClick={forceOpen ? undefined : () => onToggle(node.store.id)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-disabled={forceOpen || undefined}
          className={cn(
            'flex w-full min-h-11 items-center gap-3 p-4 pr-28 sm:p-5 sm:pr-32 text-left transition-colors duration-200 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40',
            open && 'bg-linear-to-r from-coral-500/8 to-transparent',
            forceOpen ? 'cursor-default' : 'cursor-pointer'
          )}
        >
          <EntityIconTile icon={StoreIcon} tone="coral" className="size-10 sm:size-11" />
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            <h3 className="t-card font-display font-bold leading-snug text-text line-clamp-2 break-words">{node.store.name}</h3>
            {isDropTarget ? (
              <p className="t-meta font-display font-semibold text-coral-700 dark:text-coral-300">Drop to assign here, no department</p>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {node.store.code && <CardChip icon={Hash} label={node.store.code} />}
                <CardChip icon={UsersIcon} tone="coral" label={`${node.activeCount} ${node.activeCount === 1 ? 'person' : 'people'}`} />
                <CardChip icon={Layers} tone="primary" label={`${node.departments.length} ${node.departments.length === 1 ? 'department' : 'departments'}`} />
                {!node.store.isActive && <CardChip icon={CircleOff} label="Inactive" />}
              </div>
            )}
          </div>
          <AvatarStack people={people} max={4} size="sm" className="hidden md:flex shrink-0" />
        </button>
        <div className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <ScorePill kind="store" id={node.store.id} name={node.store.name} />
          <ChevronDown className={cn('pointer-events-none size-4 text-text-light shrink-0 transition-transform duration-300', open && 'rotate-180')} aria-hidden />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border bg-surface-hover/30 p-4 sm:p-5">
              {node.departments.length === 0 && node.directUsers.length === 0 ? (
                <p className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-6 text-center t-meta font-display text-text-muted">
                  <Layers className="size-4 shrink-0 text-text-light" aria-hidden />
                  This store has no departments or staff yet. Assign a department to it from People &amp; Teams.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="flex items-center gap-2 t-meta font-display font-bold text-text-muted">
                    <Layers className="size-3.5" aria-hidden />
                    Departments
                    <span className="rounded-md bg-border/60 px-1.5 text-text-secondary tabular-nums">{node.departments.length}</span>
                  </p>
                <TreeList label={`Departments in ${node.store.name}`}>
                  {node.departments.map((d) => (
                    <TreeItem key={d.department.id} tone="coral">
                      <DepartmentSection
                        node={d}
                        isOpen={isDeptOpen(d.department.id)}
                        forceOpen={forceOpen}
                        onToggle={onToggleDept}
                        onDropUser={onDropUser}
                        onUserDragStart={onUserDragStart}
                        onUserDragEnd={onUserDragEnd}
                      />
                    </TreeItem>
                  ))}
                  {node.directUsers.length > 0 && (
                    <TreeItem tone="leaf">
                      <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface p-2">
                        <p className="px-2.5 py-1.5 t-meta font-display font-bold text-text-secondary">
                          Store staff with no department
                        </p>
                        {node.directUsers.map((u) => (
                          <UserRow key={u.id} user={u} onDragStart={onUserDragStart} onDragEnd={onUserDragEnd} />
                        ))}
                      </div>
                    </TreeItem>
                  )}
                </TreeList>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const arePropsEqual = (prev: StoreSectionProps, next: StoreSectionProps): boolean => {
  if (
    prev.node !== next.node ||
    prev.isOpen !== next.isOpen ||
    prev.forceOpen !== next.forceOpen ||
    prev.onToggle !== next.onToggle ||
    prev.onToggleDept !== next.onToggleDept ||
    prev.onDropUser !== next.onDropUser ||
    prev.onUserDragStart !== next.onUserDragStart ||
    prev.onUserDragEnd !== next.onUserDragEnd
  ) {
    return false;
  }
  return prev.node.departments.every((d) => prev.isDeptOpen(d.department.id) === next.isDeptOpen(d.department.id));
};

export const StoreSection = memo(StoreSectionComponent, arePropsEqual);
StoreSection.displayName = 'StoreSection';
