import { memo, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Layers, Store as StoreIcon, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { EntityIconTile, MetricPill, AvatarStack } from '../../../components';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { DepartmentNode } from './orgStructureDisplay';
import { readDraggedUser } from './orgStructureDisplay';
import { UserRow } from './UserRow';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DepartmentSectionProps {
  node: DepartmentNode;
  isOpen: boolean;
  forceOpen: boolean;
  /** Takes the department's own id — lets callers pass one stable, id-accepting callback down
   *  instead of a fresh per-item closure on every render (see StoreSection/OrgStructurePage). */
  onToggle: (id: string) => void;
  /** Shown only in the "Unassigned Departments" bucket, where the store link itself is the point. */
  showUnassignedStoreHint?: boolean;
  /** Reassigns a dragged person into this department. Omit to render read-only (no drop target,
   *  no draggable rows) — used nowhere today but keeps this component usable outside an editable
   *  org view without extra props. */
  onDropUser?: (userId: string, patch: { departmentId: string | null; storeId?: string | null }) => void;
  /** Passed straight through to each UserRow — see OrgStructurePage for why these two stay
   *  reference-stable across renders. Omit alongside onDropUser to render rows non-draggable. */
  onUserDragStart?: (user: DepartmentNode['users'][number]) => void;
  onUserDragEnd?: () => void;
}

// Memoized: without this, expanding/collapsing one department (or a sibling store) re-renders
// every department section — and every user row inside it — across the whole org tree.
export const DepartmentSection = memo(({ node, isOpen, forceOpen, onToggle, showUnassignedStoreHint, onDropUser, onUserDragStart, onUserDragEnd }: DepartmentSectionProps) => {
  const open = isOpen || forceOpen;
  const [isDropTarget, setIsDropTarget] = useState(false);
  const people = useMemo(
    () => node.users.map((u) => ({ name: `${u.firstName} ${u.lastName ?? ''}`, src: resolveAvatarUrl(u.avatarUrl) })),
    [node.users]
  );

  return (
    <div
      onDragOver={(e) => {
        if (!onDropUser) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={(e) => {
        if (!onDropUser) return;
        e.stopPropagation();
        setIsDropTarget(true);
      }}
      onDragLeave={(e) => {
        if (!onDropUser) return;
        e.stopPropagation();
        setIsDropTarget(false);
      }}
      onDrop={(e) => {
        if (!onDropUser) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDropTarget(false);
        const dragged = readDraggedUser(e);
        if (!dragged || dragged.departmentId === node.department.id) return;
        onDropUser(dragged.id, { departmentId: node.department.id });
      }}
      className={cn(
        'rounded-xl border overflow-hidden transition-colors duration-200',
        isDropTarget
          ? 'border-primary-400 bg-primary-50/60 dark:bg-primary-950/30 ring-2 ring-primary-500/30'
          : 'border-border/70 bg-surface-hover/30 hover:border-primary-200 hover:bg-surface'
      )}
    >
      <button
        type="button"
        onClick={forceOpen ? undefined : () => onToggle(node.department.id)}
        className="flex w-full flex-wrap items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-surface-hover cursor-pointer disabled:cursor-default"
        disabled={forceOpen}
      >
        <EntityIconTile icon={Layers} tone="primary" />
        <span className="text-sm font-display font-bold text-text truncate">{node.department.name}</span>
        {showUnassignedStoreHint && (
          <span className="flex items-center gap-1 text-[10px] font-display font-bold px-2 py-0.5 rounded-full shrink-0 bg-warning/10 text-warning">
            <StoreIcon className="w-3 h-3" /> No store
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {isDropTarget ? (
            <span className="text-[11px] font-display font-bold text-primary-600 dark:text-primary-400">Drop to move here</span>
          ) : (
            <>
              <AvatarStack people={people} max={3} size="sm" className="hidden sm:flex" />
              <MetricPill icon={Users}>
                {node.users.length} {node.users.length === 1 ? 'member' : 'members'}
              </MetricPill>
            </>
          )}
          <ChevronDown className={cn('w-3.5 h-3.5 text-text-light shrink-0 transition-transform duration-300', open && 'rotate-180')} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-0.5 px-2 pb-2.5 pt-0.5 border-t border-border/60 mx-1">
              {node.users.length === 0 ? (
                <p className="px-3 py-2.5 text-xs font-display text-text-light italic">No members in this department yet.</p>
              ) : (
                node.users.map((u) => (
                  <UserRow key={u.id} user={u} onDragStart={onUserDragStart} onDragEnd={onUserDragEnd} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
DepartmentSection.displayName = 'DepartmentSection';
