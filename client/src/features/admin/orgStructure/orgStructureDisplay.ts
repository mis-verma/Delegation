import type { DragEvent } from 'react';
import type { AdminUser } from '../../../api/admin';
import type { Department } from '../../../api/departments';
import type { Store } from '../../../api/stores';
import { ROLE_LABEL } from '../roleBadge';

export interface DepartmentNode {
  department: Department;
  users: AdminUser[];
  heads: AdminUser[];
  activeCount: number;
  storeMismatch: Map<string, string>;
}

export interface StoreNode {
  store: Store;
  departments: DepartmentNode[];
  directUsers: AdminUser[];
  activeCount: number;
}

export interface OrgTree {
  stores: StoreNode[];
  unassignedDepartments: DepartmentNode[];
  unassignedUsers: AdminUser[];
}

export const isDepartmentHead = (u: AdminUser): boolean => u.isActive && (u.role === 'MANAGER' || u.role === 'SENIOR');

export const fullName = (u: AdminUser): string => `${u.firstName} ${u.lastName ?? ''}`.trim();

const byHeadThenName = (a: AdminUser, b: AdminUser): number => {
  const headRank = Number(isDepartmentHead(b)) - Number(isDepartmentHead(a));
  if (headRank !== 0) return headRank;
  const activeRank = Number(b.isActive) - Number(a.isActive);
  if (activeRank !== 0) return activeRank;
  return fullName(a).localeCompare(fullName(b));
};

export const needsDepartment = (u: AdminUser): boolean =>
  u.isActive && !u.departmentId && u.role !== 'ADMIN' && u.role !== 'PC' && !(u.role === 'SENIOR' && !!u.storeId);

export const buildOrgTree = (
  stores: Store[],
  departments: Department[],
  users: AdminUser[],
  showDeactivated: boolean,
): OrgTree => {
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));
  const usersByDept = new Map<string, AdminUser[]>();
  const directStoreUsers = new Map<string, AdminUser[]>();
  const unassignedUsers: AdminUser[] = [];

  users.forEach((u) => {
    if (u.departmentId) {
      const list = usersByDept.get(u.departmentId) ?? [];
      list.push(u);
      usersByDept.set(u.departmentId, list);
    } else if (u.storeId) {
      const list = directStoreUsers.get(u.storeId) ?? [];
      list.push(u);
      directStoreUsers.set(u.storeId, list);
    } else {
      unassignedUsers.push(u);
    }
  });

  const deptsByStore = new Map<string, Department[]>();
  const unassignedDepartments: Department[] = [];
  departments.forEach((d) => {
    if (d.storeId) {
      const list = deptsByStore.get(d.storeId) ?? [];
      list.push(d);
      deptsByStore.set(d.storeId, list);
    } else {
      unassignedDepartments.push(d);
    }
  });

  const visible = (list: AdminUser[]) => (showDeactivated ? list : list.filter((u) => u.isActive));

  const toDeptNode = (d: Department): DepartmentNode => {
    const all = [...(usersByDept.get(d.id) ?? [])].sort(byHeadThenName);
    const storeMismatch = new Map<string, string>();
    const deptStoreId = d.storeId;
    if (deptStoreId) {
      all.forEach((u) => {
        if (u.storeId && u.storeId !== deptStoreId) {
          storeMismatch.set(
            u.id,
            `Assigned to ${storeNameById.get(u.storeId) ?? 'another store'}, but this department belongs to ${storeNameById.get(deptStoreId) ?? 'a different store'}.`,
          );
        }
      });
    }
    return {
      department: d,
      users: visible(all),
      heads: all.filter(isDepartmentHead),
      activeCount: all.filter((u) => u.isActive).length,
      storeMismatch,
    };
  };

  return {
    stores: stores.map((store) => {
      const departmentNodes = (deptsByStore.get(store.id) ?? []).map(toDeptNode);
      const direct = [...(directStoreUsers.get(store.id) ?? [])].sort(byHeadThenName);
      return {
        store,
        departments: departmentNodes,
        directUsers: visible(direct),
        activeCount: direct.filter((u) => u.isActive).length + departmentNodes.reduce((sum, d) => sum + d.activeCount, 0),
      };
    }),
    unassignedDepartments: unassignedDepartments.map(toDeptNode),
    unassignedUsers: visible([...unassignedUsers].sort(byHeadThenName)),
  };
};

const matches = (haystack: string | null | undefined, query: string) => !!haystack && haystack.toLowerCase().includes(query);
const userMatches = (u: AdminUser, query: string) =>
  matches(fullName(u), query) || matches(u.email, query) || matches(u.role, query) || matches(ROLE_LABEL[u.role], query);

export const filterOrgTree = (tree: OrgTree, rawQuery: string): OrgTree => {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return tree;

  const filterDept = (node: DepartmentNode): DepartmentNode | null => {
    const selfMatches = matches(node.department.name, query);
    const users = selfMatches ? node.users : node.users.filter((u) => userMatches(u, query));
    if (!selfMatches && users.length === 0) return null;
    return { ...node, users };
  };

  const filterStore = (node: StoreNode): StoreNode | null => {
    const selfMatches = matches(node.store.name, query) || matches(node.store.code, query);
    if (selfMatches) return node;
    const departments = node.departments.map(filterDept).filter((d): d is DepartmentNode => d !== null);
    const directUsers = node.directUsers.filter((u) => userMatches(u, query));
    if (departments.length === 0 && directUsers.length === 0) return null;
    return { ...node, departments, directUsers };
  };

  return {
    stores: tree.stores.map(filterStore).filter((s): s is StoreNode => s !== null),
    unassignedDepartments: tree.unassignedDepartments.map(filterDept).filter((d): d is DepartmentNode => d !== null),
    unassignedUsers: tree.unassignedUsers.filter((u) => userMatches(u, query)),
  };
};

export interface DraggedUser {
  id: string;
  departmentId: string | null;
  storeId: string | null;
}

const DRAG_MIME = 'application/json';

export const readDraggedUser = (e: DragEvent): DraggedUser | null => {
  const raw = e.dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DraggedUser;
  } catch {
    return null;
  }
};

export const isLeavingDropTarget = (e: DragEvent): boolean =>
  !e.currentTarget.contains(e.relatedTarget as Node | null);

export interface OrgMovePatch {
  departmentId: string | null;
  storeId?: string | null;
}
