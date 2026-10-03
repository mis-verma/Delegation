import { memo, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Store as StoreIcon, Users as UsersIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { EntityIconTile, MetricPill, AvatarStack } from '../../../components';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { OrgMovePatch, StoreNode } from './orgStructureDisplay';
import { fullName, isLeavingDropTarget, readDraggedUser } from './orgStructureDisplay';
import { DepartmentSection } from './DepartmentSection';
import { UserRow } from './UserRow';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StoreSectionProps {
  node: StoreNode;
  isOpen: boolean;
  forceOpen: boolean;
  /** Takes the store's own id, see DepartmentSection's onToggle for why. */
  onToggle: (id: string) => void;
  isDeptOpen: (id: string) => boolean;
  onToggleDept: (id: string) => void;
  /** Reassigns a dragged person: into a department inside this store, or (dropped on the store's
   *  own header) directly onto the store with no department. Omit to render read-only. */
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
    // No box-shadow: a card changes border colour on hover, same as every other card.
    // Drop target for "assign directly to this store, no department". Nested departments are their
    // own targets: a drop there never reaches this handler, and their enter events (which do bubble
    // up) switch this highlight off so only one target lights up at a time.
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
          ? 'border-coral-400 bg-coral-500/10 dark:bg-coral-500/15 ring-2 ring-coral-500/30'
          : 'border-border bg-surface hover:border-coral-200'
      )}
    >
      <button
        type="button"
        onClick={forceOpen ? undefined : () => onToggle(node.store.id)}
        aria-expanded={open}
        aria-controls={panelId}
        // aria-disabled, not disabled: while a search holds every branch open the button must stay focusable.
        aria-disabled={forceOpen || undefined}
        className={cn(
          'flex w-full min-h-11 items-center gap-4 p-4 sm:p-5 text-left transition-colors duration-200 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40',
          forceOpen ? 'cursor-default' : 'cursor-pointer'
        )}
      >
        <EntityIconTile icon={StoreIcon} tone="coral" className="w-8 h-8 sm:w-9 sm:h-9" />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 min-w-0 text-base font-display font-bold text-text">
            <span className="truncate">{node.store.name}</span>
            {!node.store.isActive && (
              <span className="shrink-0 text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md border border-border bg-surface-hover text-text-muted">
                Deactivated
              </span>
            )}
          </h3>
          <p className="text-xs font-display text-text-muted truncate">
            {isDropTarget
              ? 'Drop to assign here, no department'
              : `${node.departments.length} ${node.departments.length === 1 ? 'department' : 'departments'}${node.store.code ? ` · ${node.store.code}` : ''}`}
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2.5 shrink-0">
          <AvatarStack people={people} max={4} size="sm" />
          <MetricPill icon={UsersIcon}>{node.activeCount} {node.activeCount === 1 ? 'person' : 'people'}</MetricPill>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-text-light shrink-0 transition-transform duration-300', open && 'rotate-180')} aria-hidden />
      </button>

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
            <div className="flex flex-col gap-2 px-4 sm:px-5 pb-5 border-t border-border/70 pt-4">
              {node.departments.length === 0 && node.directUsers.length === 0 ? (
                <p className="px-1 text-sm font-display text-text-muted">No departments or staff assigned to this store yet.</p>
              ) : (
                <>
                  {node.departments.map((d) => (
                    <DepartmentSection
                      key={d.department.id}
                      node={d}
                      isOpen={isDeptOpen(d.department.id)}
                      forceOpen={forceOpen}
                      onToggle={onToggleDept}
                      onDropUser={onDropUser}
                      onUserDragStart={onUserDragStart}
                      onUserDragEnd={onUserDragEnd}
                    />
                  ))}
                  {node.directUsers.length > 0 && (
                    <div className="rounded-xl border border-dashed border-border px-2 py-2 bg-surface-hover/40">
                      <p className="px-1 pb-1 text-[10px] font-display font-bold text-text-light tracking-wide">
                        Store-level staff (no department)
                      </p>
                      {node.directUsers.map((u) => (
                        <UserRow key={u.id} user={u} onDragStart={onUserDragStart} onDragEnd={onUserDragEnd} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Custom comparator, not a default shallow-props memo(): `isDeptOpen` is a closure over
// OrgStructurePage's whole `expandedDepts` Set, so its identity changes on every single
// department toggle anywhere in the tree. A default shallow compare would see that as "a prop
// changed" and re-render every StoreSection, not just the one containing the toggled department,
// defeating the memoization this component exists for. Comparing the actually-resolved open/
// closed state of this store's own departments instead means an unrelated store's section only
// re-renders when something about IT changes.
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
