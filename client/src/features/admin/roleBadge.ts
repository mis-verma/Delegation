import type { Role } from '../../api/admin';

// Shared across UserList.tsx and the Org Structure view so role colors never drift apart.
// Theme tokens only, tinted with opacity so they read in light and dark: the more access a role has,
// the stronger the colour (Admin red, Approval Manager gold, PC green, Senior and Manager navy, Agent
// amber, User neutral).
export const ROLE_STYLES: Record<Role, string> = {
  ADMIN: 'bg-danger/10 text-danger border-danger/25',
  APPROVAL_MANAGER: 'bg-coral-500/10 dark:bg-coral-500/15 text-coral-700 dark:text-coral-300 border-coral-500/30',
  SENIOR: 'bg-primary-500/15 dark:bg-primary-500/20 text-primary-800 dark:text-primary-200 border-primary-500/40',
  MANAGER: 'bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 border-primary-500/25',
  AGENT: 'bg-warning/10 text-warning border-warning/25',
  USER: 'bg-surface-hover text-text-secondary border-border',
  PC: 'bg-success/10 text-success border-success/25',
};

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
