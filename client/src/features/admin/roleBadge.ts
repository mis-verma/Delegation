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

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  APPROVAL_MANAGER: 'Approval Manager',
  SENIOR: 'Senior',
  MANAGER: 'Manager',
  AGENT: 'Agent',
  USER: 'User',
  PC: 'PC',
};
