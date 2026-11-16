import type { AdminUser, Role, UserPresence } from '../../../api/admin';

const ORG_WIDE_ROLES: readonly Role[] = ['ADMIN', 'PC', 'OWNER'];

interface Active { isActive: boolean }

export interface OrgCounts {
  activePeople: number;
  deactivated: number;
  unplaced: number;
  noDepartment: number;
  noStore: number;
  activeDepartments: number;
  inactiveDepartments: number;
  activeStores: number;
  inactiveStores: number;
}

const needsPlace = (user: AdminUser) => user.isActive && !ORG_WIDE_ROLES.includes(user.role);

export const countOrg = (users: AdminUser[] | undefined, departments: Active[] | undefined, stores: Active[] | undefined): OrgCounts => {
  const people = users ?? [];
  const placeable = people.filter(needsPlace);
  const noDepartment = placeable.filter((u) => !u.departmentId).length;
  const noStore = placeable.filter((u) => !u.storeId).length;
  const activeDepartments = (departments ?? []).filter((d) => d.isActive).length;
  const activeStores = (stores ?? []).filter((s) => s.isActive).length;
  const activePeople = people.filter((u) => u.isActive).length;
  return {
    activePeople,
    deactivated: people.length - activePeople,
    unplaced: placeable.filter((u) => !u.departmentId || !u.storeId).length,
    noDepartment,
    noStore,
    activeDepartments,
    inactiveDepartments: (departments?.length ?? 0) - activeDepartments,
    activeStores,
    inactiveStores: (stores?.length ?? 0) - activeStores,
  };
};

export const onlineActive = (users: AdminUser[] | undefined, presence: UserPresence[] | undefined): number | null => {
  if (!users || !presence) return null;
  const active = new Set(users.filter((u) => u.isActive).map((u) => u.id));
  return presence.filter((p) => p.online && active.has(p.id)).length;
};

export const unplacedCaption = (counts: OrgCounts): string => {
  if (counts.unplaced === 0) return 'Everyone placed';
  const parts = [
    counts.noDepartment > 0 && `${counts.noDepartment} no department`,
    counts.noStore > 0 && `${counts.noStore} no store`,
  ].filter(Boolean);
  return parts.join(', ');
};
