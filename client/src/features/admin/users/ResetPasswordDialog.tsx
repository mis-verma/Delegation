import { KeyRound } from 'lucide-react';
import { Modal } from '../../../components';
import type { AdminUser } from '../../../api/admin';
import { ResetPasswordSection } from './PasswordPanels';
import { fullName } from './userDisplay';

interface ResetPasswordDialogProps {
  user: AdminUser;
  onClose: () => void;
}

export const ResetPasswordDialog = ({ user, onClose }: ResetPasswordDialogProps) => (
  <Modal
    open
    onClose={onClose}
    size="md"
    icon={<KeyRound className="w-5 h-5" />}
    title={`Reset password for ${fullName(user)}`}
    description="They will choose their own password the next time they sign in."
  >
    <ResetPasswordSection userId={user.id} email={user.email} defaultExpanded onFinished={onClose} />
  </Modal>
);
