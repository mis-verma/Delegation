import type { Role } from '../../api/admin';

// Role colours live in the shared RoleChip (components/roleChip).

/** What a role can see: own work only, their department's team, or everything. */
export type RoleScope = 'own' | 'department' | 'all';

export interface RoleMeta {
  label: string;
  /** One plain sentence, shown under the Role field and in role pickers. */
  description: string;
  scope: RoleScope;
}

// The one place that says what each role is and what it can see. Cards, the form's role options,
// the bulk "Change role" menu and the placement warnings all read from here so the wording
// can't drift between them.
export const ROLE_META: Record<Role, RoleMeta> = {
  USER: { label: 'User', description: 'Sees only their own work.', scope: 'own' },
  AGENT: { label: 'Agent', description: 'Sees only their own work.', scope: 'own' },
  MANAGER: { label: 'Manager', description: 'Department head. Sees and approves their department’s team.', scope: 'department' },
  SENIOR: { label: 'Senior', description: 'Department head. Sees and approves their department’s team.', scope: 'department' },
  PC: { label: 'PC', description: 'Process coordinator. Sees everything across the organization.', scope: 'all' },
  APPROVAL_MANAGER: { label: 'Approval Manager', description: 'Gives the final sign-off. Sees everything across the organization.', scope: 'all' },
  ADMIN: { label: 'Admin', description: 'Full access. Sees and manages everything.', scope: 'all' },
};

// Kept as a plain lookup because other screens import it by name.
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: ROLE_META.ADMIN.label,
  APPROVAL_MANAGER: ROLE_META.APPROVAL_MANAGER.label,
  SENIOR: ROLE_META.SENIOR.label,
  MANAGER: ROLE_META.MANAGER.label,
  AGENT: ROLE_META.AGENT.label,
  USER: ROLE_META.USER.label,
  PC: ROLE_META.PC.label,
};

/** Order the role pickers list them in: least access first. */
export const ROLE_ORDER: Role[] = ['USER', 'AGENT', 'MANAGER', 'SENIOR', 'PC', 'APPROVAL_MANAGER', 'ADMIN'];

/** Manager and Senior both lead a department. */
export const isDepartmentHead = (role: Role) => ROLE_META[role].scope === 'department';
