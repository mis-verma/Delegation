import { BadgeCheck, ClipboardCheck, Headset, ShieldCheck, Star, User, Users, type LucideIcon } from 'lucide-react';
import { IconChip } from '../iconChip';
import { ROLE_LABEL } from '../../features/admin/roleBadge';
import type { Role } from '../../api/auth';

// Same chip language as StatusChip / PriorityChip / DepartmentChip (a solid icon circle and a bold
// label in a bordered pill). The more access a role has, the stronger its colour: Admin red,
// Approval Manager gold, PC green, Senior and Manager navy, Agent amber, User neutral.
const ROLE_CHIP: Record<Role, { icon: LucideIcon; tone: string }> = {
  ADMIN: { icon: ShieldCheck, tone: 'bg-danger' },
  APPROVAL_MANAGER: { icon: BadgeCheck, tone: 'bg-coral-500' },
  PC: { icon: ClipboardCheck, tone: 'bg-success' },
  SENIOR: { icon: Star, tone: 'bg-primary-800' },
  MANAGER: { icon: Users, tone: 'bg-primary-600' },
  AGENT: { icon: Headset, tone: 'bg-warning' },
  USER: { icon: User, tone: 'bg-text-muted' },
};

interface RoleChipProps {
  role: Role;
  /** Label only, no icon circle, for very tight rows. */
  compact?: boolean;
  className?: string;
}

/** The one place a person's role is drawn. Users, Org Structure, Who's Online, the Audit Log and Account Settings all use it. */
export const RoleChip = ({ role, compact = false, className }: RoleChipProps) => {
  const look = ROLE_CHIP[role] ?? ROLE_CHIP.USER;
  return <IconChip icon={compact ? false : look.icon} tone={look.tone} label={ROLE_LABEL[role] ?? role} className={className} />;
};
