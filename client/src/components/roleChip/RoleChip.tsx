import { IconChip } from '../iconChip';
import { ROLE_LABEL } from '../../features/admin/roleBadge';
import type { Role } from '../../api/auth';
import { ROLE_LOOK } from './roleLook';

interface RoleChipProps {
  role: Role;
  label?: string;
  compact?: boolean;
  className?: string;
}

export const RoleChip = ({ role, label, compact = false, className }: RoleChipProps) => {
  const look = ROLE_LOOK[role] ?? ROLE_LOOK.USER;
  return <IconChip icon={compact ? false : look.icon} tone={look.tone} label={label ?? ROLE_LABEL[role] ?? role} className={className} />;
};
