import { memo, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Layers, Store as StoreIcon, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { EntityIconTile, MetricPill, AvatarStack } from '../../../components';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { DepartmentNode, OrgMovePatch } from './orgStructureDisplay';
import { fullName, isDepartmentHead, isLeavingDropTarget, readDraggedUser } from './orgStructureDisplay';
import { UserRow } from './UserRow';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HEADER_CHIP = 'shrink-0 inline-flex items-center gap-1 text-xs font-display font-bold px-2 py-0.5 rounded-full border';

interface DepartmentSectionProps {
  node: DepartmentNode;
  isOpen: boolean;
  forceOpen: boolean;
  /** Takes the department's own id, so callers can pass one stable, id-accepting callback down
   *  instead of a fresh per-item closure on every render (see StoreSection/OrgStructurePage). */
  onToggle: (id: string) => void;
  /** Shown only in the "Departments without a store" bucket, where the store link itself is the point. */
  showUnassignedStoreHint?: boolean;
  /** Reassigns a dragged person into this department. Omit to render read-only (no drop target,
   *  no draggable rows). */
  onDropUser?: (userId: string, patch: OrgMovePatch) => void;
  /** Passed straight through to each UserRow, see OrgStructurePage for why these two stay
   *  reference-stable across renders. Omit alongside onDropUser to render rows non-draggable. */
  onUserDragStart?: (user: DepartmentNode['users'][number]) => void;
  onUserDragEnd?: () => void;
}

// Memoized: without this, expanding/collapsing one department (or a sibling store) re-renders
// every department section, and every user row inside it, across the whole org tree.
export const DepartmentSection = memo(({ node, isOpen, forceOpen, onToggle, showUnassignedStoreHint, onDropUser, onUserDragStart, onUserDragEnd }: DepartmentSectionProps) => {
  const open = isOpen || forceOpen;
  const panelId = useId();
  const [isDropTarget, setIsDropTarget] = useState(false);
  const { department, heads } = node;
  const people = useMemo(
    () => node.users.filter((u) => u.isActive).map((u) => ({ name: fullName(u), src: resolveAvatarUrl(u.avatarUrl) })),
    [node.users]
  );
  const headLabel = heads.length > 0 ? `Head: ${fullName(heads[0])}${heads.length > 1 ? ` +${heads.length - 1}` : ''}` : null;

  return (
    <div
      data-org-dept=""
      onDragOver={(e) => {
        if (!onDropUser) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
      }}
      // enter/leave are left to bubble: the parent store reads them (via data-org-dept) to drop its
      // own highlight while the pointer is over this department.
      onDragEnter={() => {
        if (onDropUser) setIsDropTarget(true);
      }}
      onDragLeave={(e) => {
        if (onDropUser && isLeavingDropTarget(e)) setIsDropTarget(false);
      }}
      onDrop={(e) => {
        if (!onDropUser) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDropTarget(false);
        const dragged = readDraggedUser(e);
        if (!dragged || dragged.departmentId === department.id) return;
        // A department that belongs to a store carries the person to that store too.
        onDropUser(dragged.id, { departmentId: department.id, ...(department.storeId ? { storeId: department.storeId } : {}) });
      }}
      className={cn(
        // Outline, not ring: no box-shadows on this page. -outline-offset keeps it inside the card edge.
        '@container flex flex-col rounded-2xl border overflow-hidden bg-surface transition-colors duration-200',
        isDropTarget
          ? 'border-primary-400 bg-primary-500/10 dark:bg-primary-500/15 outline outline-2 -outline-offset-2 outline-primary-500/40'
          : 'border-border hover:border-primary-300'
      )}
    >
      <button
        type="button"
        onClick={forceOpen ? undefined : () => onToggle(department.id)}
        aria-expanded={open}
        aria-controls={panelId}
        // aria-disabled, not disabled: while a search holds every branch open the button must stay focusable.
        aria-disabled={forceOpen || undefined}
        className={cn(
          'flex w-full min-h-11 items-start gap-3 p-4 text-left transition-colors duration-200 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40',
          open && 'bg-gradient-to-r from-primary-500/8 to-transparent',
          forceOpen ? 'cursor-default' : 'cursor-pointer'
        )}
      >
        <EntityIconTile icon={Layers} tone="primary" className="size-9" />
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <span className="text-sm font-display font-bold leading-snug text-text line-clamp-2 break-words">{department.name}</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {headLabel ? (
              <span className="text-xs font-display text-text-muted line-clamp-1 break-words">{headLabel}</span>
            ) : department.headOptional ? (
              <span className="text-xs font-display text-text-light">Head not needed</span>
            ) : (
              <span className={cn(HEADER_CHIP, 'border-warning/30 bg-warning/10 text-warning')}>No head</span>
            )}
            {showUnassignedStoreHint && (
              <span className={cn(HEADER_CHIP, 'border-warning/30 bg-warning/10 text-warning')}>
                <StoreIcon className="size-3" aria-hidden /> No store
              </span>
            )}
            {!department.isActive && (
              <span className={cn(HEADER_CHIP, 'border-border bg-surface-hover text-text-muted')}>Deactivated</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-center">
          {isDropTarget ? (
            <span className="text-xs font-display font-bold text-primary-600 dark:text-primary-400">Drop to move here</span>
          ) : (
            <>
              <AvatarStack people={people} max={3} size="sm" className="hidden @md:flex" />
              <MetricPill icon={Users}>
                {node.activeCount} {node.activeCount === 1 ? 'member' : 'members'}
              </MetricPill>
            </>
          )}
          <ChevronDown className={cn('size-4 text-text-light shrink-0 transition-transform duration-300', open && 'rotate-180')} aria-hidden />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1 p-2 border-t border-border/70 bg-surface-hover/40">
              {node.users.length === 0 ? (
                <p className="px-2.5 py-3 text-xs font-display text-text-muted">Nobody is in this department yet. Drag someone here, or use Move to on their row.</p>
              ) : (
                node.users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isHead={isDepartmentHead(u)}
                    storeMismatch={node.storeMismatch.get(u.id)}
                    onDragStart={onUserDragStart}
                    onDragEnd={onUserDragEnd}
                  />
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
