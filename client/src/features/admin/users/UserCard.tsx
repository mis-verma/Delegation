import { memo } from 'react';
import { Clock, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENTITY_CARD_CLASS, Avatar } from '../../../components';
import type { AdminUser } from '../../../api/admin';
import { isDepartmentHead } from '../roleBadge';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { formatRelativeTime } from '../../dashboard/dashboardDisplay';
import { UserActionsMenu, type UserActionHandlers } from './UserActionsMenu';
import { DeactivatedChip, DepartmentHeadChip, DepartmentLabel, RoleChip, StoreLabel } from './UserBits';
import { deactivatedLabel, fullName } from './userDisplay';

interface UserCardProps extends UserActionHandlers {
  user: AdminUser;
  /** Resolved from user.departmentId by the parent list; undefined when unassigned. */
  departmentName?: string;
  storeName?: string;
  /** Undefined while presence is still loading, so the dot and label stay hidden instead of
   *  guessing "offline" for someone who may be active right now. */
  online?: boolean;
  /** "Active now", "Active 2h ago" or "Never active". Empty while presence is loading. */
  presenceText: string;
  busy: boolean;
  isSelf: boolean;
}

const UserCardComponent = ({
  user, departmentName, storeName, online, presenceText, busy, isSelf,
  onEdit, onResetPassword, onDeactivate, onReactivate, onDelete,
}: UserCardProps) => {
  const name = fullName(user);

  return (
    <article className={cn(ENTITY_CARD_CLASS, 'gap-3', busy && 'pointer-events-none')}>
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={name} src={resolveAvatarUrl(user.avatarUrl)} size="sm" online={online} />
          <div className="flex flex-col min-w-0">
            {/* The title is the card's one primary action. Its ::after stretches over the whole
                card, so a click anywhere opens Edit while the menu and phone stay above it. */}
            <h3 className="min-w-0">
              <button
                type="button"
                onClick={() => onEdit(user)}
                className={cn(
                  'text-left text-sm font-display font-bold truncate max-w-full cursor-pointer outline-none transition-colors duration-200',
                  'after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary-500/50',
                  user.isActive ? 'text-text group-hover:text-primary-600 dark:group-hover:text-primary-400' : 'text-text-muted',
                )}
              >
                {name}
              </button>
            </h3>
            <p className="text-xs font-display text-text-muted truncate" title={user.email}>{user.email}</p>
          </div>
        </div>

        <UserActionsMenu
          user={user}
          isBusy={busy}
          isSelf={isSelf}
          onEdit={onEdit}
          onResetPassword={onResetPassword}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
          onDelete={onDelete}
        />
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <RoleChip role={user.role} />
        {isDepartmentHead(user.role) && <DepartmentHeadChip />}
        {!user.isActive && <DeactivatedChip label={deactivatedLabel(user)} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <DepartmentLabel name={departmentName} />
        <StoreLabel name={storeName} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2.5 border-t border-border/60 text-[11px] font-display font-medium text-text-light">
        {user.phone && (
          <span className="inline-flex items-center gap-1 text-text-muted">
            <Phone className="size-3 shrink-0" aria-hidden />
            {user.phone}
          </span>
        )}
        <span className="inline-flex items-center gap-1" title={new Date(user.createdAt).toLocaleDateString()}>
          <Clock className="size-3 shrink-0" aria-hidden />
          Joined {formatRelativeTime(user.createdAt)}
        </span>
        {user.isActive && presenceText && (
          <span className={online ? 'text-success' : undefined}>{presenceText}</span>
        )}
      </div>
    </article>
  );
};

export const UserCard = memo(UserCardComponent);
