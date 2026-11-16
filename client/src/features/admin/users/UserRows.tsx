import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, DepartmentChip, PresenceChip, RoleChip, StoreChip } from '../../../components';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { AdminUser, UserPresence } from '../../../api/admin';
import { presenceLabel } from '../presenceDisplay';
import { UserActionsMenu, type UserActionHandlers } from './UserActionsMenu';
import { deactivatedLabel, fullName } from './userDisplay';

interface UserRowsProps extends UserActionHandlers {
  users: readonly AdminUser[];
  departmentNames: ReadonlyMap<string, string>;
  storeNames: ReadonlyMap<string, string>;
  presenceById: ReadonlyMap<string, UserPresence>;
  busyId?: string;
  selfId?: string;
}

export const UserRows = memo(({ users, departmentNames, storeNames, presenceById, busyId, selfId, ...handlers }: UserRowsProps) => (
  <ul className="flex flex-col gap-2">
    {users.map((user) => {
      const name = fullName(user);
      const presence = presenceById.get(user.id);
      const department = user.departmentId ? departmentNames.get(user.departmentId) : undefined;
      const store = user.storeId ? storeNames.get(user.storeId) : undefined;
      return (
        <li
          key={user.id}
          className={cn('flex items-center gap-3 rounded-lg border border-border/60 bg-surface p-2.5 sm:px-3', !user.isActive && 'bg-surface-hover/30', busyId === user.id && 'pointer-events-none opacity-50')}
        >
          <Avatar name={name} src={resolveAvatarUrl(user.avatarUrl)} size="md" online={presence?.online} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <button
              type="button"
              onClick={() => handlers.onEdit(user)}
              aria-label={`Edit ${name}`}
              className="w-fit max-w-full cursor-pointer rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <span className={cn('line-clamp-2 break-words t-card font-display font-bold leading-snug', user.isActive ? 'text-text' : 'text-text-secondary')}>{name}</span>
            </button>
            <span className="flex flex-wrap items-center gap-1.5">
              <RoleChip role={user.role} compact />
              {department && <DepartmentChip name={department} iconOnlyOnMobile />}
              {store && <StoreChip name={store} className="max-sm:hidden" />}
            </span>
          </div>
          <span className="hidden shrink-0 md:inline-flex">
            <PresenceChip online={presence?.online} text={presenceLabel(presence)} deactivated={!user.isActive} deactivatedLabel={deactivatedLabel(user)} />
          </span>
          <UserActionsMenu user={user} isBusy={busyId === user.id} isSelf={user.id === selfId} {...handlers} />
        </li>
      );
    })}
  </ul>
));
UserRows.displayName = 'UserRows';
