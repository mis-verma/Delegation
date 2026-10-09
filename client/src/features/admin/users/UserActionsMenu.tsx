import { memo, useMemo } from 'react';
import { KeyRound, MoreVertical, Pencil, Trash2, UserCheck, UserMinus } from 'lucide-react';
import { Dropdown, Loader, type DropdownAction } from '../../../components';
import type { AdminUser } from '../../../api/admin';
import { useAuth } from '../../../context/AuthContext';

export interface UserActionHandlers {
  onEdit: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onDeactivate: (user: AdminUser) => void;
  onReactivate: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}

interface UserActionsMenuProps extends UserActionHandlers {
  user: AdminUser;
  /** A change to this person is in flight. */
  isBusy?: boolean;
  /** You cannot deactivate or delete your own account from here. */
  isSelf?: boolean;
}

// The one place a person's actions live, on both the card and the table row. Edit is also what a
// click on the card or name does, so the menu is for everything else. Delete is tucked at the
// bottom and only offered once someone is deactivated: switching a person off is the normal way
// to remove them, and it keeps their name on old records.
const UserActionsMenuComponent = ({ user, isBusy, isSelf, onEdit, onResetPassword, onDeactivate, onReactivate, onDelete }: UserActionsMenuProps) => {
  // A PC cannot change an admin account (the server refuses it too), so there is nothing to offer.
  const { user: me } = useAuth();
  const lockedAdmin = me?.role === 'PC' && user.role === 'ADMIN';
  const items = useMemo<DropdownAction[]>(() => {
    const list: DropdownAction[] = [{ label: 'Edit', icon: Pencil, onClick: () => onEdit(user) }];
    // Not for yourself: a reset signs you out at once. Your own password is changed from your profile.
    if (!isSelf) list.push({ label: 'Reset password', icon: KeyRound, onClick: () => onResetPassword(user) });
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
  }, [user, isSelf, onEdit, onResetPassword, onDeactivate, onReactivate, onDelete]);

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
