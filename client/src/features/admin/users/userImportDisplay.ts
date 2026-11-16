import type { ImportRole } from '../../../api/admin';

export const ROLE_LABEL: Record<ImportRole, string> = {
  USER: 'User',
  AGENT: 'Agent',
  MANAGER: 'Manager',
  SENIOR: 'Senior',
  APPROVAL_MANAGER: 'Approval manager',
};
