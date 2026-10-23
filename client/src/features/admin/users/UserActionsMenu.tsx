import { memo, useMemo } from 'react';
import { Eye, KeyRound, MailCheck, MoreVertical, Pencil, Trash2, UserCheck, UserMinus } from 'lucide-react';
import { Dropdown, Loader, type DropdownAction } from '../../../components';
import type { AdminUser } from '../../../api/admin';
import { useAuth } from '../../../context/AuthContext';
import { useSendPasswordCodeMutation } from '../hook';
import { useStartPreview } from '../../viewAs/useStartPreview';

export interface UserActionHandlers {
  onEdit: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onDeactivate: (user: AdminUser) => void;
  onReactivate: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}

interface UserActionsMenuProps extends UserActionHandlers {
  user: AdminUser;
  isBusy?: boolean;
  isSelf?: boolean;
}

const UserActionsMenuComponent = ({ user, isBusy, isSelf, onEdit, onResetPassword, onDeactivate, onReactivate, onDelete }: UserActionsMenuProps) => {
  const { user: me, realUser } = useAuth();
  const { start: startPreview } = useStartPreview();
  const lockedAdmin = me?.role === 'PC' && (user.role === 'ADMIN' || user.role === 'OWNER');
  const { mutate: sendCode } = useSendPasswordCodeMutation();
  const items = useMemo<DropdownAction[]>(() => {
    const list: DropdownAction[] = [{ label: 'Edit', icon: Pencil, onClick: () => onEdit(user) }];
    if (!isSelf && realUser?.role === 'ADMIN' && user.isActive && user.role !== 'ADMIN') {
      list.push({ label: `Preview as ${user.firstName}`, icon: Eye, onClick: () => void startPreview(user.id) });
    }
    if (!isSelf) list.push({ label: 'Reset password', icon: KeyRound, onClick: () => onResetPassword(user) });
    if (!isSelf && user.isActive) list.push({ label: 'Email password code', icon: MailCheck, onClick: () => sendCode(user.id) });
    if (!isSelf) {
      list.push(
        user.isActive
          ? { label: 'Deactivate', icon: UserMinus, onClick: () => onDeactivate(user) }
          : { label: 'Reactivate', icon: UserCheck, onClick: () => onReactivate(user) },
      );
      if (!user.isActive) {
        list.push({ label: 'Delete', icon: Trash2, variant: 'destructive', separatorBefore: true, onClick: () => onDelete(user) });
      }
    }
    return list;
  }, [user, isSelf, realUser?.role, onEdit, onResetPassword, onDeactivate, onReactivate, onDelete, sendCode, startPreview]);

  if (lockedAdmin) return null;

  return (
    <Dropdown
      items={items}
      trigger={
        <button
          type="button"
          disabled={isBusy}
          aria-label={`Actions for ${user.firstName}`}
          className="relative z-10 flex items-center justify-center size-11 sm:size-8 shrink-0 rounded-lg text-text-muted cursor-pointer transition-colors duration-200 hover:bg-surface-hover hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? <Loader size="sm" variant="slate" className="size-4" /> : <MoreVertical className="size-4" strokeWidth={2.25} />}
        </button>
      }
    />
  );
};

export const UserActionsMenu = memo(UserActionsMenuComponent);
