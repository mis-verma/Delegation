import { memo } from 'react';
import { Building2, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, RoleChip, PresenceChip, StateChip } from '../../../components';
import type { AdminUser } from '../../../api/admin';
import { ROLE_META, isDepartmentHead } from '../roleBadge';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { UserActionsMenu, type UserActionHandlers } from './UserActionsMenu';
import { DepartmentHeadChip } from './UserBits';
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

const CELL_CLASS = 'px-3 py-3 align-middle text-xs text-text-secondary';
const NOT_SET = <span className="text-text-light">Not set</span>;

const REACH_EDGE = { all: 'border-l-primary-500', department: 'border-l-coral-500', own: 'border-l-transparent' } as const;

const STICKY_BG = 'bg-surface group-hover/row:bg-surface-hover';
const STICKY_SELECTED = 'bg-[color-mix(in_oklab,var(--color-primary-500)_8%,var(--color-surface))]';

const Place = ({ icon: Icon, name, tone }: { icon: typeof Building2; name?: string; tone: string }) =>
  name ? (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className={cn('flex items-center justify-center size-6 rounded-md shrink-0', tone)}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="font-medium text-text truncate max-w-[12rem]" title={name}>{name}</span>
    </span>
  ) : (
    NOT_SET
  );

const UserRowComponent = ({
  user, departmentName, storeName, online, presenceText, selected, busy, isSelf, onToggleSelect,
  onEdit, onResetPassword, onDeactivate, onReactivate, onDelete,
}: UserRowProps) => {
  const name = fullName(user);

  return (
    <tr
      onClick={() => onEdit(user)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(user);
        }
      }}
      className={cn(
        'group/row border-b border-border/40 last:border-b-0 cursor-pointer transition-colors duration-200 ease-in-out hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
        selected && 'bg-primary-500/5 dark:bg-primary-500/10',
        !user.isActive && 'opacity-80',
        busy && 'pointer-events-none',
      )}
    >
      <td
        className={cn(CELL_CLASS, 'w-14 min-w-14 sticky left-0 z-10 border-l-[3px]', selected ? STICKY_SELECTED : STICKY_BG, user.isActive ? REACH_EDGE[ROLE_META[user.role].scope] : 'border-l-transparent')}
        onClick={(e) => e.stopPropagation()}
      >
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

      <td className={cn(CELL_CLASS, 'min-w-[14rem] max-w-[22rem] sticky left-14 z-10', selected ? STICKY_SELECTED : STICKY_BG)}>
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={name} src={resolveAvatarUrl(user.avatarUrl)} size="md" online={online} className={user.isActive ? undefined : 'opacity-60 grayscale'} />
          <div className="flex flex-col min-w-0">
            <span className={cn('text-sm font-display font-bold truncate', user.isActive ? 'text-text' : 'text-text-muted')}>
              {name}
            </span>
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
        <Place icon={Building2} name={departmentName} tone="bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300" />
      </td>

      <td className={cn(CELL_CLASS, 'whitespace-nowrap')}>
        <Place icon={Store} name={storeName} tone="bg-coral-500/10 dark:bg-coral-500/15 text-coral-700 dark:text-coral-300" />
      </td>

      <td className={cn(CELL_CLASS, 'whitespace-nowrap')}>
        {user.isActive ? (
          <StateChip active />
        ) : (
          <StateChip active={false} label={deactivatedLabel(user)} />
        )}
      </td>

      <td className={cn(CELL_CLASS, 'whitespace-nowrap')}>
        {!user.isActive ? <span className="text-text-light">-</span> : <PresenceChip online={online} text={presenceText || 'Never active'} />}
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
