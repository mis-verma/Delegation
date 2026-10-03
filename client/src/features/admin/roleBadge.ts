import type { Role } from '../../api/admin';

// Shared across UserList.tsx and the Org Structure view so role colors never drift apart.
export const ROLE_STYLES: Record<Role, string> = {
  ADMIN: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30',
  APPROVAL_MANAGER: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/30',
  SENIOR: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30',
  MANAGER: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/30',
  AGENT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',
  USER: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  PC: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30',
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
