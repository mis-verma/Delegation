import { IconChip } from '../iconChip';
import { ROLE_LABEL } from '../../features/admin/roleBadge';
import type { Role } from '../../api/auth';
import { ROLE_LOOK } from './roleLook';

// Same chip language as StatusChip / PriorityChip / DepartmentChip (a solid icon circle and a bold
// label in a bordered pill). The more access a role has, the stronger its colour: Admin red,
// Approval Manager gold, PC green, Senior and Manager navy, Agent amber, User neutral.

interface RoleChipProps {
  role: Role;
  /** Label only, no icon circle, for very tight rows. */
  compact?: boolean;
  className?: string;
}

/** The one place a person's role is drawn. Users, Org Structure, Who's Online, the Audit Log and Account Settings all use it. */
export const RoleChip = ({ role, compact = false, className }: RoleChipProps) => {
  const look = ROLE_LOOK[role] ?? ROLE_LOOK.USER;
  return <IconChip icon={compact ? false : look.icon} tone={look.tone} label={ROLE_LABEL[role] ?? role} className={className} />;
};
