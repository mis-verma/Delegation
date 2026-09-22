import { memo, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Avatar } from '../../../components';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { AdminUser } from '../../../api/admin';
import { ROLE_STYLES, ROLE_LABEL } from '../roleBadge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface UserRowProps {
  user: AdminUser;
  /** Stable across renders (see OrgStructurePage's onUserDragStart/onUserDragEnd) so passing
   *  them doesn't defeat this row's own memoization. */
  onDragStart?: (user: AdminUser) => void;
  onDragEnd?: () => void;
}

// Memoized: a large org can render hundreds of these inside StoreSection/DepartmentSection —
// without this, toggling one accordion elsewhere re-renders every row in the tree.
export const UserRow = memo(({ user, onDragStart, onDragEnd }: UserRowProps) => {
  // Local only — doesn't need to be known outside this one row, so it can't defeat memoization
  // on any ancestor the way a top-down "which user is dragging" prop would.
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const draggable = !!onDragStart;

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
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
        <GripVertical className="w-3.5 h-3.5 text-text-light/0 group-hover:text-text-light shrink-0 transition-colors duration-150" />
      )}
      <Avatar name={`${user.firstName} ${user.lastName ?? ''}`} src={resolveAvatarUrl(user.avatarUrl)} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-display font-medium text-text truncate">
          {user.firstName} {user.lastName ?? ''}
        </p>
        <p className="text-xs font-display text-text-muted truncate">{user.email}</p>
      </div>
      <span
        className={cn(
          'shrink-0 text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md border',
          ROLE_STYLES[user.role]
        )}
      >
        {ROLE_LABEL[user.role]}
      </span>
      {!user.isActive && (
        <span className="shrink-0 text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md bg-surface-hover text-text-light border border-border">
          Inactive
        </span>
      )}
    </div>
  );
});
UserRow.displayName = 'UserRow';
