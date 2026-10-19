import { memo, useState } from 'react';
import { Crown, GripVertical, TriangleAlert } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Avatar, RoleChip, StateChip } from '../../../components';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { AdminUser } from '../../../api/admin';
import { MoveToMenu } from './MoveToMenu';
import { useOrgMove } from './orgMoveContext';
import { ScorePill } from '../directory/orgScores';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CHIP = 'shrink-0 inline-flex items-center gap-1 t-meta font-display font-semibold px-1.5 py-0.5 rounded-md border';

interface UserRowProps {
  user: AdminUser;
  isHead?: boolean;
  storeMismatch?: string;
  onDragStart?: (user: AdminUser) => void;
  onDragEnd?: () => void;
  className?: string;
}

export const UserRow = memo(({ user, isHead, storeMismatch, onDragStart, onDragEnd, className }: UserRowProps) => {
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const draggable = !!onDragStart;
  const name = `${user.firstName} ${user.lastName ?? ''}`.trim();
  const orgApi = useOrgMove();
  const reportsToName = user.reportsToId ? orgApi?.nameOf(user.reportsToId) : undefined;

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
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
        '@container group flex min-h-14 items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent transition-colors duration-200 hover:bg-surface hover:border-border/70',
        draggable && 'cursor-grab active:cursor-grabbing',
        isBeingDragged && 'opacity-40',
        className
      )}
    >
      {draggable && (
        <GripVertical className="hidden sm:block size-3.5 -mr-1 text-text-light/0 group-hover:text-text-light shrink-0 transition-colors duration-150" aria-hidden />
      )}
      <Avatar name={name} src={resolveAvatarUrl(user.avatarUrl)} size="md" className={user.isActive ? undefined : 'opacity-60 grayscale'} />
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <p className={cn('t-card font-display font-semibold leading-snug line-clamp-2 break-words', user.isActive ? 'text-text' : 'text-text-secondary')}>{name}</p>
        <p className="t-meta font-display text-text-muted line-clamp-1 break-all">{user.email}</p>
        {reportsToName && <p className="t-meta font-display text-text-muted line-clamp-1">Reports to <span className="font-semibold text-text-secondary">{reportsToName}</span></p>}
        <div className="flex flex-wrap items-center gap-1">
          <RoleChip role={user.role} className="@sm:hidden" />
          {isHead && (
            <span className={cn(CHIP, 'border-primary-500/30 bg-primary-500/10 text-primary-700 dark:text-primary-300')}>
              <Crown className="size-3" aria-hidden />
              Dept head
            </span>
          )}
          {storeMismatch && (
            <span title={storeMismatch} className={cn(CHIP, 'border-warning/30 bg-warning/10 text-warning')}>
              <TriangleAlert className="size-3" aria-hidden />
              Different store
              <span className="sr-only">. {storeMismatch}</span>
            </span>
          )}
          {!user.isActive && <StateChip active={false} label="Deactivated" size="sm" />}
        </div>
      </div>
      <RoleChip role={user.role} className="hidden @sm:inline-flex shrink-0" />
      <ScorePill kind="person" id={user.id} name={name} />
      <MoveToMenu userId={user.id} userName={name} currentDepartmentId={user.departmentId} />
    </div>
  );
});
UserRow.displayName = 'UserRow';
