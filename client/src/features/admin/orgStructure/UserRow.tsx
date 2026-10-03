import { memo, useState } from 'react';
import { GripVertical, TriangleAlert } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Avatar } from '../../../components';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { AdminUser } from '../../../api/admin';
import { ROLE_STYLES, ROLE_LABEL } from '../roleBadge';
import { MoveToMenu } from './MoveToMenu';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CHIP = 'shrink-0 inline-flex items-center gap-1 text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md border';

interface UserRowProps {
  user: AdminUser;
  /** Shows the "Dept head" chip. Only passed from inside a department. */
  isHead?: boolean;
  /** Plain-language reason this person's store does not match their department's store. */
  storeMismatch?: string;
  /** Stable across renders (see OrgStructurePage's onUserDragStart/onUserDragEnd) so passing
   *  them doesn't defeat this row's own memoization. */
  onDragStart?: (user: AdminUser) => void;
  onDragEnd?: () => void;
}

// Memoized: a large org can render hundreds of these inside StoreSection/DepartmentSection,
// without this, toggling one accordion elsewhere re-renders every row in the tree.
export const UserRow = memo(({ user, isHead, storeMismatch, onDragStart, onDragEnd }: UserRowProps) => {
  // Local only: doesn't need to be known outside this one row, so it can't defeat memoization
  // on any ancestor the way a top-down "which user is dragging" prop would.
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const draggable = !!onDragStart;
  const name = `${user.firstName} ${user.lastName ?? ''}`.trim();

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        // React events bubble out of portals, so ignore a drag that began in the Move to menu.
        if (!draggable || !e.currentTarget.contains(e.target as Node)) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(
          'application/json',
          JSON.stringify({ id: user.id, departmentId: user.departmentId, storeId: user.storeId })
        );
        setIsBeingDragged(true);
        onDragStart?.(user);
      }}
      onDragEnd={() => {
        setIsBeingDragged(false);
        onDragEnd?.();
      }}
      className={cn(
        'group flex items-center gap-1 px-2.5 py-2 rounded-lg transition-colors duration-200 hover:bg-surface-hover',
        draggable && 'cursor-grab active:cursor-grabbing',
        isBeingDragged && 'opacity-40'
      )}
    >
      {draggable && (
        <GripVertical className="hidden sm:block w-3.5 h-3.5 text-text-light/0 group-hover:text-text-light shrink-0 transition-colors duration-150" aria-hidden />
      )}
      <Avatar name={name} src={resolveAvatarUrl(user.avatarUrl)} size="sm" />
      <div className="min-w-0 flex-1 pl-1.5 flex flex-col gap-0.5">
        <p className={cn('text-sm font-display font-medium truncate', user.isActive ? 'text-text' : 'text-text-secondary')}>{name}</p>
        <p className="text-xs font-display text-text-muted truncate">{user.email}</p>
        <div className="flex flex-wrap items-center gap-1">
          <span className={cn(CHIP, 'sm:hidden', ROLE_STYLES[user.role])}>{ROLE_LABEL[user.role]}</span>
          {isHead && (
            <span className={cn(CHIP, 'border-primary-500/30 bg-primary-500/10 text-primary-700 dark:text-primary-300')}>Dept head</span>
          )}
          {storeMismatch && (
            <span title={storeMismatch} className={cn(CHIP, 'border-warning/30 bg-warning/10 text-warning')}>
              <TriangleAlert className="size-3" aria-hidden />
              Different store
              <span className="sr-only">. {storeMismatch}</span>
            </span>
          )}
          {!user.isActive && <span className={cn(CHIP, 'border-border bg-surface-hover text-text-muted')}>Deactivated</span>}
        </div>
      </div>
      <span className={cn(CHIP, 'hidden sm:inline-flex', ROLE_STYLES[user.role])}>{ROLE_LABEL[user.role]}</span>
      <MoveToMenu userId={user.id} userName={name} currentDepartmentId={user.departmentId} />
    </div>
  );
});
UserRow.displayName = 'UserRow';
