import type { Role } from '../../../api/admin';

export interface Capability {
  label: string;
  roles: readonly Role[];
  /** 'view' capabilities are the only ones Owner (read-only PC mirror) can use. Defaults to 'action'. */
  kind?: 'view' | 'action';
  note?: string;
}

export interface CapabilityGroup {
  group: string;
  capabilities: readonly Capability[];
}

const ALL_ROLES: readonly Role[] = ['ADMIN', 'APPROVAL_MANAGER', 'SENIOR', 'MANAGER', 'AGENT', 'USER', 'PC'];
const HEADS: readonly Role[] = ['MANAGER', 'SENIOR'];
const ORG_WIDE: readonly Role[] = ['ADMIN', 'APPROVAL_MANAGER', 'PC'];
const BACK_OFFICE: readonly Role[] = ['ADMIN', 'PC'];

export const CAPABILITY_MATRIX: readonly CapabilityGroup[] = [
  {
    group: 'Checklists',
    capabilities: [
      { label: 'Fill and submit an assigned checklist', roles: ALL_ROLES },
      { label: 'Build or schedule a checklist', roles: BACK_OFFICE },
      { label: 'Delete a checklist or template', roles: ['ADMIN'] },
      { label: 'Approve as department head', roles: HEADS },
      { label: "Give final approval, or send a checklist back", roles: BACK_OFFICE },
      { label: 'See checklist reports for their own department', roles: HEADS, kind: 'view' },
      { label: 'See checklist reports across every department', roles: ORG_WIDE, kind: 'view' },
    ],
  },
  {
    group: 'Tickets',
    capabilities: [
      { label: 'Raise and track their own tickets', roles: ALL_ROLES },
      { label: 'See and manage every ticket, any department', roles: ORG_WIDE },
      { label: 'Approve a ticket as department head', roles: HEADS },
      { label: 'Give final sign-off on a ticket', roles: ORG_WIDE },
      { label: 'Pick reviewers for a ticket', roles: BACK_OFFICE },
      { label: 'See ticket reports for their own department', roles: HEADS, kind: 'view' },
      { label: 'See ticket reports across every department', roles: ORG_WIDE, kind: 'view' },
    ],
  },
  {
    group: 'Delegation',
    capabilities: [
      { label: 'Create and track their own delegated work', roles: ALL_ROLES },
      { label: 'See every department’s delegated work', roles: ORG_WIDE, kind: 'view' },
      { label: 'Approve delegated work as department head', roles: HEADS },
      { label: 'Give final approval on delegated work', roles: ORG_WIDE },
      { label: 'Pick reviewers for a piece of work', roles: BACK_OFFICE },
    ],
  },
  {
    group: 'People & teams',
    capabilities: [
      { label: 'Create, edit or deactivate a person', roles: BACK_OFFICE, note: 'PC cannot touch an Admin or Owner account.' },
      { label: 'Create or edit an Admin / Owner account', roles: ['ADMIN'] },
      { label: 'Create or edit departments and stores', roles: BACK_OFFICE },
      { label: 'Delete a department or store', roles: ['ADMIN'] },
      { label: 'Create or edit custom roles', roles: ['ADMIN'] },
      { label: 'View as another person (impersonate)', roles: ['ADMIN'] },
    ],
  },
  {
    group: 'Leave',
    capabilities: [
      { label: 'Request their own leave', roles: ALL_ROLES },
      { label: 'Approve leave for their own department', roles: HEADS },
      { label: 'Approve leave for anyone, any department', roles: BACK_OFFICE },
    ],
  },
  {
    group: 'Reports & scores',
    capabilities: [
      { label: "See their own department's scores", roles: HEADS, kind: 'view' },
      { label: 'See scores across every department and store', roles: ORG_WIDE, kind: 'view' },
    ],
  },
  {
    group: 'Audit & system',
    capabilities: [
      { label: 'Read the full audit log', roles: ['ADMIN'], kind: 'view' },
      { label: 'Read audit entries for tickets, tasks and checklists', roles: ['PC'], kind: 'view' },
      { label: 'Change organization settings', roles: BACK_OFFICE, note: 'Some security settings are Admin-only.' },
      { label: 'Open system health & maintenance tools', roles: ['ADMIN'] },
    ],
  },
];

export const roleIsReadOnly = (role: Role): boolean => role === 'OWNER';

/** Owner mirrors PC's rules for lookup purposes, then the read-only gate strips out anything that isn't a view. */
export const lookupRoleFor = (role: Role): Role => (role === 'OWNER' ? 'PC' : role);
