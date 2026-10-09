import { memo } from 'react';
import { Clock, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENTITY_CARD_CLASS, Avatar, Skeleton, RoleChip, PresenceChip } from '../../../components';
import type { AdminUser } from '../../../api/admin';
import { ROLE_META, isDepartmentHead } from '../roleBadge';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { formatRelativeTime } from '../../dashboard/dashboardDisplay';
import { UserActionsMenu, type UserActionHandlers } from './UserActionsMenu';
import { DepartmentHeadChip, PlaceField } from './UserBits';
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

// The colour strip across the top says how far someone's access reaches at a glance: the whole
// organisation, one department, or only their own work (no strip). A deactivated person gets none.
const REACH_STRIP = {
  all: 'bg-gradient-to-r from-primary-500 to-primary-700 dark:from-primary-400 dark:to-primary-600',
  department: 'bg-gradient-to-r from-coral-400 to-coral-600 dark:from-coral-400 dark:to-coral-500',
  own: '',
} as const;

// Round, 44px on touch, quiet until hovered. They sit above the card's stretched title link.
const CONTACT_BUTTON =
  'relative z-10 inline-flex items-center justify-center size-8 pointer-coarse:size-11 rounded-full text-text-muted bg-surface-hover/70 hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50';

const UserCardComponent = ({
  user, departmentName, storeName, online, presenceText, busy, isSelf,
  onEdit, onResetPassword, onDeactivate, onReactivate, onDelete,
}: UserCardProps) => {
  const name = fullName(user);
  const muted = !user.isActive;
  const strip = muted ? '' : REACH_STRIP[ROLE_META[user.role].scope];

  return (
    // justify-start: the footer pins itself with mt-auto, so a taller grid row never spreads the
    // other blocks apart.
    <article className={cn(ENTITY_CARD_CLASS, 'justify-start gap-4 overflow-hidden', muted && 'bg-surface-hover/30', busy && 'pointer-events-none')}>
      {strip && <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1', strip)} />}

      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3.5 min-w-0">
          <Avatar
            name={name}
            src={resolveAvatarUrl(user.avatarUrl)}
            size="lg"
            online={online}
            className={muted ? 'opacity-60 grayscale' : undefined}
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            {/* The title is the card's one primary action. Its ::after stretches over the whole
                card, so a click anywhere opens Edit while the menu and contact buttons stay above it. */}
            <h3 className="min-w-0">
              <button
                type="button"
                onClick={() => onEdit(user)}
                title={name}
                className={cn(
                  'text-left t-card font-display font-bold tracking-tight truncate max-w-full cursor-pointer outline-none transition-colors duration-200',
                  'after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary-500/50',
                  user.isActive ? 'text-text group-hover:text-primary-600 dark:group-hover:text-primary-400' : 'text-text-muted',
                )}
              >
                {name}
              </button>
            </h3>
            <p className="t-meta font-display text-text-muted truncate" title={user.email}>{user.email}</p>
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
        <PresenceChip online={online} text={presenceText} deactivated={!user.isActive} deactivatedLabel={deactivatedLabel(user)} />
      </div>

      {/* One soft panel for where they work, instead of two floating tiles: department on the left,
          store on the right, a hairline between. Stacks on a narrow card. */}
      <div className="grid grid-cols-1 min-[22rem]:grid-cols-2 gap-3 min-[22rem]:gap-0 min-[22rem]:divide-x divide-border/60 rounded-xl bg-surface-hover/50 dark:bg-surface-hover/30 p-3">
        <PlaceField kind="department" name={departmentName} muted={muted} />
        <div className="min-[22rem]:pl-3">
          <PlaceField kind="store" name={storeName} muted={muted} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-3 mt-auto border-t border-border/60">
        <div className="flex flex-col gap-0.5 min-w-0 t-meta font-display font-medium text-text-light">
          {user.phone && (
            <span className="inline-flex items-center gap-1 text-text-muted tabular-nums truncate">
              <Phone className="size-3 shrink-0" aria-hidden />
              {user.phone}
            </span>
          )}
          <span className="inline-flex items-center gap-1" title={new Date(user.createdAt).toLocaleDateString()}>
            <Clock className="size-3 shrink-0" aria-hidden />
            Joined {formatRelativeTime(user.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {user.phone && (
            <a href={`tel:${user.phone}`} className={CONTACT_BUTTON} aria-label={`Call ${name}`} title="Call">
              <Phone className="size-4" aria-hidden />
            </a>
          )}
          <a href={`mailto:${user.email}`} className={CONTACT_BUTTON} aria-label={`Email ${name}`} title="Email">
            <Mail className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </article>
  );
};

export const UserCard = memo(UserCardComponent);

// Same chrome, rows and gaps as the card above (header, chips, place panel, footer), so the grid
// does not jump when the real people arrive.
export const UserCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'justify-start gap-4 overflow-hidden')} aria-hidden>
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <Skeleton className="size-12 rounded-full shrink-0" />
        <div className="flex flex-col gap-1.5 min-w-0 flex-1 max-w-[70%]">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
      <Skeleton className="size-8 rounded-lg shrink-0" />
    </div>
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-5 w-20 rounded-md" />
      <Skeleton className="h-4 w-14" />
    </div>
    <Skeleton className="h-[3.75rem] w-full rounded-xl" />
    <div className="flex items-center justify-between gap-3 pt-3 mt-auto border-t border-border/60">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="size-8 rounded-full" />
      </div>
    </div>
  </div>
);
