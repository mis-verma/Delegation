import type { Role } from '../../api/admin';

export type RoleScope = 'own' | 'department' | 'all';

export interface RoleMeta {
  label: string;
  description: string;
  scope: RoleScope;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  USER: { label: 'User', description: 'Sees only their own work.', scope: 'own' },
  AGENT: { label: 'Agent', description: 'Sees only their own work.', scope: 'own' },
  MANAGER: { label: 'Manager', description: 'Department head. Sees and approves their department’s team.', scope: 'department' },
  SENIOR: { label: 'Senior', description: 'Department head. Sees and approves their department’s team.', scope: 'department' },
  PC: { label: 'PC', description: 'Process coordinator. Sees everything across the organization.', scope: 'all' },
  APPROVAL_MANAGER: { label: 'Approval Manager', description: 'Gives the final sign-off. Sees everything across the organization.', scope: 'all' },
  ADMIN: { label: 'Admin', description: 'Full access. Sees and manages everything.', scope: 'all' },
  OWNER: { label: 'Owner', description: 'Read only. Sees scores and approvals across the organization, and cannot change anything.', scope: 'all' },
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: ROLE_META.ADMIN.label,
  APPROVAL_MANAGER: ROLE_META.APPROVAL_MANAGER.label,
  SENIOR: ROLE_META.SENIOR.label,
  MANAGER: ROLE_META.MANAGER.label,
  AGENT: ROLE_META.AGENT.label,
  USER: ROLE_META.USER.label,
  PC: ROLE_META.PC.label,
  OWNER: ROLE_META.OWNER.label,
};

export const ROLE_ORDER: Role[] = ['USER', 'AGENT', 'MANAGER', 'SENIOR', 'PC', 'APPROVAL_MANAGER', 'OWNER', 'ADMIN'];

export const isDepartmentHead = (role: Role) => ROLE_META[role].scope === 'department';
