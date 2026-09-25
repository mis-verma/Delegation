import { Building2, Clock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ENTITY_CARD_CLASS, StatusPill, EntityCardActions, Avatar } from '../../../components';
import type { AdminUser, UserPresence } from '../../../api/admin';
import { ROLE_STYLES, ROLE_LABEL } from '../roleBadge';
import { presenceLabel } from '../presenceDisplay';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { formatRelativeTime } from '../../dashboard/dashboardDisplay';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface UserCardProps {
  user: AdminUser;
  /** Resolved from user.departmentId by the parent list — undefined when unassigned. */
  departmentName?: string;
  /** Undefined while the presence query is still loading — the dot/label just don't render yet
   *  rather than guessing "offline" for what might actually be "active now". */
  presence?: UserPresence;
  isUpdating: boolean;
  isDeleting: boolean;
  onToggleActive: (id: string, isActive: boolean) => void;
  onEdit: (user: AdminUser) => void;
  onDelete: (id: string) => void;
}

export const UserCard = ({ user, departmentName, presence, isUpdating, isDeleting, onToggleActive, onEdit, onDelete }: UserCardProps) => (
  <article
    className={cn(
      ENTITY_CARD_CLASS,
      // Inactive accounts read as visibly muted (not just a small text pill) so a scan of the
      // grid shows who's active/inactive at a glance, not just on close reading of each card.
      !user.isActive && 'opacity-65 saturate-50',
      isDeleting && 'opacity-50 pointer-events-none grayscale-[0.3]'
    )}
  >
    <div>
      <header className="flex items-start justify-between gap-2.5 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Same 32px footprint as EntityIconTile, shaped as an avatar circle instead — the
              consistent "leading visual" pattern shared with Department/Store cards, adapted for
              a person. Real photo when the user has one, initials otherwise. */}
          <Avatar name={`${user.firstName} ${user.lastName ?? ''}`} src={resolveAvatarUrl(user.avatarUrl)} size="sm" online={presence?.online} />
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-sm font-display font-bold text-text truncate group-hover:text-primary-600 transition-colors duration-300">
              {user.firstName} {user.lastName ?? ''}
            </h3>
            <p className="text-xs font-display font-medium text-text-muted truncate" title={user.email}>
              {user.email}
            </p>
          </div>
        </div>

        <StatusPill
          active={user.isActive}
          isUpdating={isUpdating}
          onToggle={() => onToggleActive(user.id, user.isActive)}
          ariaLabel={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.firstName}`}
        />
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1 text-[11px] font-display font-medium text-text-muted bg-surface-hover px-1.5 py-1 rounded-md border border-border/50 w-fit">
          <Building2 className="w-3 h-3 text-text-light shrink-0" />
          {/* No max-w cap — the row already wraps (`flex-wrap` above), and at 150px even the
              placeholder text ("No department assigned") was clipping to an ellipsis. */}
          <span className={cn(!departmentName && 'italic text-text-light')}>
            {departmentName ?? 'No department assigned'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-display font-medium text-text-light" title={new Date(user.createdAt).toLocaleDateString()}>
          <Clock className="w-3 h-3 shrink-0" />
          Joined {formatRelativeTime(user.createdAt)}
        </div>
        {presence && (
          <span className={cn('text-[11px] font-display font-medium', presence.online ? 'text-success' : 'text-text-light')}>
            {presenceLabel(presence)}
          </span>
        )}
      </div>
    </div>

    <footer className="flex items-center justify-between pt-2.5 mt-3 border-t border-border/60">
      <span className={cn('text-[11px] font-display font-bold px-1.5 py-0.5 rounded-md border', ROLE_STYLES[user.role])}>
        {ROLE_LABEL[user.role]}
      </span>

      <EntityCardActions
        onEdit={() => onEdit(user)}
        onDelete={() => onDelete(user.id)}
        isDeleting={isDeleting}
        editLabel={`Edit ${user.firstName}`}
        deleteLabel={`Delete ${user.firstName}`}
      />
    </footer>
  </article>
);
