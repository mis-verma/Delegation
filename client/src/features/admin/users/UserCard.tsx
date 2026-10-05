import { memo } from 'react';
import { Clock, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENTITY_CARD_CLASS, Avatar, Skeleton } from '../../../components';
import type { AdminUser } from '../../../api/admin';
import { isDepartmentHead } from '../roleBadge';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { formatRelativeTime } from '../../dashboard/dashboardDisplay';
import { UserActionsMenu, type UserActionHandlers } from './UserActionsMenu';
import { ActiveStatus, DeactivatedChip, DepartmentHeadChip, PlaceField, RoleChip } from './UserBits';
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
  const muted = !user.isActive;

  return (
    // justify-start: the footer pins itself with mt-auto, so a taller grid row never spreads the
    // other blocks apart.
    <article className={cn(ENTITY_CARD_CLASS, 'justify-start gap-3.5', busy && 'pointer-events-none')}>
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            name={name}
            src={resolveAvatarUrl(user.avatarUrl)}
            size="md"
            online={online}
            className={muted ? 'opacity-60 grayscale' : undefined}
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            {/* The title is the card's one primary action. Its ::after stretches over the whole
                card, so a click anywhere opens Edit while the menu and phone stay above it. */}
            <h3 className="min-w-0">
              <button
                type="button"
                onClick={() => onEdit(user)}
                title={name}
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <RoleChip role={user.role} />
          {isDepartmentHead(user.role) && <DepartmentHeadChip />}
        </div>
        {user.isActive ? <ActiveStatus /> : <DeactivatedChip label={deactivatedLabel(user)} />}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PlaceField kind="department" name={departmentName} muted={muted} />
        <PlaceField kind="store" name={storeName} muted={muted} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 mt-auto border-t border-border/60 text-[11px] font-display font-medium text-text-light">
        {user.phone && (
          <span className="inline-flex items-center gap-1 text-text-muted tabular-nums">
            <Phone className="size-3 shrink-0" aria-hidden />
            {user.phone}
          </span>
        )}
        <span className="inline-flex items-center gap-1" title={new Date(user.createdAt).toLocaleDateString()}>
          <Clock className="size-3 shrink-0" aria-hidden />
          Joined {formatRelativeTime(user.createdAt)}
        </span>
        {user.isActive && presenceText && (
          <span className={cn('sm:ml-auto', online && 'text-success')}>{presenceText}</span>
        )}
      </div>
    </article>
  );
};

export const UserCard = memo(UserCardComponent);

// Same chrome, rows and gaps as the card above (header, chips, two place tiles, footer), so the grid
// does not jump when the real people arrive.
export const UserCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'justify-start gap-3.5')} aria-hidden>
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="flex flex-col gap-1.5 min-w-0 flex-1 max-w-[70%]">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
      <Skeleton className="size-8 rounded-lg shrink-0" />
    </div>
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-5 w-20 rounded-md" />
      <Skeleton className="h-4 w-14" />
    </div>
    <div className="grid grid-cols-2 gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
    <div className="flex items-center gap-3 pt-3 mt-auto border-t border-border/60">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-16" />
    </div>
  </div>
);
