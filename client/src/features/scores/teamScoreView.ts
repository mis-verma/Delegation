import type { Role } from '../../api/admin';
import type { ExplorerView } from '../../api/scores';
import { isDepartmentHead } from '../admin/roleBadge';

const EXPLORER_ROLES: readonly Role[] = ['ADMIN', 'PC', 'OWNER', 'MANAGER', 'SENIOR'];

export const canUseScoreExplorer = (role: Role | undefined): boolean => !!role && EXPLORER_ROLES.includes(role);

export const teamScoreView = (role: Role | undefined): ExplorerView => (role && isDepartmentHead(role) ? 'person' : 'department');
