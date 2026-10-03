import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from '../../../components';
import type { AdminUser } from '../../../api/admin';
import { isDepartmentHead } from '../roleBadge';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { UserActionsMenu, type UserActionHandlers } from './UserActionsMenu';
import { DeactivatedChip, DepartmentHeadChip, RoleChip } from './UserBits';
import { deactivatedLabel, fullName } from './userDisplay';

interface UserRowProps extends UserActionHandlers {
  user: AdminUser;
  departmentName?: string;
  storeName?: string;
  online?: boolean;
  presenceText: string;
  selected: boolean;
  busy: boolean;
  isSelf: boolean;
  onToggleSelect: (id: string) => void;
}

const CELL_CLASS = 'px-3 py-2.5 align-middle text-xs text-text-secondary';

const UserRowComponent = ({
  user, departmentName, storeName, online, presenceText, selected, busy, isSelf, onToggleSelect,
  onEdit, onResetPassword, onDeactivate, onReactivate, onDelete,
}: UserRowProps) => {
  const name = fullName(user);

  return (
    <tr
      // Clicking anywhere on the row opens Edit; the name button is the keyboard route to it.
      onClick={() => onEdit(user)}
      className={cn(
        'border-b border-border/40 last:border-b-0 cursor-pointer transition-colors duration-200 hover:bg-surface-hover/60',
        selected && 'bg-primary-500/5 dark:bg-primary-500/10',
        busy && 'pointer-events-none',
      )}
    >
      <td className={cn(CELL_CLASS, 'w-10')} onClick={(e) => e.stopPropagation()}>
        <label className="flex items-center justify-center size-8 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(user.id)}
            aria-label={`Select ${name}`}
            className="size-4 rounded border-border accent-primary-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
          />
        </label>
      </td>

      <td className={cn(CELL_CLASS, 'min-w-[14rem]')}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={name} src={resolveAvatarUrl(user.avatarUrl)} size="sm" online={online} />
          <div className="flex flex-col min-w-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(user); }}
              className={cn(
                'text-left text-sm font-display font-bold truncate cursor-pointer outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-primary-500/50',
                user.isActive ? 'text-text' : 'text-text-muted',
              )}
            >
              {name}
            </button>
            <span className="text-xs text-text-muted truncate" title={user.email}>{user.email}</span>
          </div>
        </div>
      </td>

      <td className={CELL_CLASS}>
        <div className="flex flex-wrap items-center gap-1">
          <RoleChip role={user.role} />
          {isDepartmentHead(user.role) && <DepartmentHeadChip />}
        </div>
      </td>

      <td className={cn(CELL_CLASS, 'whitespace-nowrap')}>
        {departmentName ?? <span className="italic text-text-light">None</span>}
      </td>

      <td className={cn(CELL_CLASS, 'whitespace-nowrap')}>
        {storeName ?? <span className="italic text-text-light">None</span>}
      </td>

      <td className={cn(CELL_CLASS, 'whitespace-nowrap')}>
        {user.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-success font-semibold">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            Active
          </span>
        ) : (
          <DeactivatedChip label={deactivatedLabel(user)} />
        )}
      </td>

      <td className={cn(CELL_CLASS, 'whitespace-nowrap text-text-muted', online && 'text-success')}>
        {user.isActive && presenceText ? presenceText : <span className="text-text-light">-</span>}
      </td>

      <td className={cn(CELL_CLASS, 'w-12')} onClick={(e) => e.stopPropagation()}>
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
      </td>
    </tr>
  );
};

export const UserRow = memo(UserRowComponent);
