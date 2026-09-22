import type { DragEvent } from 'react';
import type { AdminUser } from '../../../api/admin';
import type { Department } from '../../../api/departments';
import type { Store } from '../../../api/stores';

export interface DepartmentNode {
  department: Department;
  users: AdminUser[];
}

export interface StoreNode {
  store: Store;
  departments: DepartmentNode[];
  /** Users assigned directly to this store with no department — e.g. SENIOR. */
  directUsers: AdminUser[];
}

export interface OrgTree {
  stores: StoreNode[];
  /** Departments with no home store set yet. */
  unassignedDepartments: DepartmentNode[];
  /** Users with neither a department nor a store. */
  unassignedUsers: AdminUser[];
}

// The ladder: Store -> Department -> User, using Department.storeId (the link added so a
// MANAGER's department-scoped view and a SENIOR's store-scoped view can resolve into each
// other — see server/src/utils/reportScope.ts). Anything left unassigned surfaces as its own
// bucket instead of silently vanishing, so gaps in the setup are visible, not hidden.
export const buildOrgTree = (stores: Store[], departments: Department[], users: AdminUser[]): OrgTree => {
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

  const toDeptNode = (d: Department): DepartmentNode => ({ department: d, users: usersByDept.get(d.id) ?? [] });

  return {
    stores: stores.map((store) => ({
      store,
      departments: (deptsByStore.get(store.id) ?? []).map(toDeptNode),
      directUsers: directStoreUsers.get(store.id) ?? [],
    })),
    unassignedDepartments: unassignedDepartments.map(toDeptNode),
    unassignedUsers,
  };
};

const norm = (s: string) => s.toLowerCase();
const matches = (haystack: string, query: string) => norm(haystack).includes(query);
const userMatches = (u: AdminUser, query: string) =>
  matches(`${u.firstName} ${u.lastName ?? ''}`, query) || matches(u.email, query) || matches(u.role, query);

// If a branch's own name matches, every descendant is kept as-is (searching "Downtown" shows
// the whole store). Otherwise only descendants that themselves match survive, recursively.
export const filterOrgTree = (tree: OrgTree, rawQuery: string): OrgTree => {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return tree;

  const filterDept = (node: DepartmentNode): DepartmentNode | null => {
    const selfMatches = matches(node.department.name, query);
    const users = selfMatches ? node.users : node.users.filter((u) => userMatches(u, query));
    if (!selfMatches && users.length === 0) return null;
    return { department: node.department, users };
  };

  const filterStore = (node: StoreNode): StoreNode | null => {
    const selfMatches = matches(node.store.name, query);
    if (selfMatches) return node;
    const departments = node.departments.map(filterDept).filter((d): d is DepartmentNode => d !== null);
    const directUsers = node.directUsers.filter((u) => userMatches(u, query));
    if (departments.length === 0 && directUsers.length === 0) return null;
    return { store: node.store, departments, directUsers };
  };

  return {
    stores: tree.stores.map(filterStore).filter((s): s is StoreNode => s !== null),
    unassignedDepartments: tree.unassignedDepartments.map(filterDept).filter((d): d is DepartmentNode => d !== null),
    unassignedUsers: tree.unassignedUsers.filter((u) => userMatches(u, query)),
  };
};

export const countUsersInTree = (tree: OrgTree): number =>
  tree.stores.reduce((sum, s) => sum + s.directUsers.length + s.departments.reduce((dSum, d) => dSum + d.users.length, 0), 0) +
  tree.unassignedDepartments.reduce((sum, d) => sum + d.users.length, 0) +
  tree.unassignedUsers.length;

/** What a UserRow puts on the wire when a drag starts — just enough for a drop target to tell
 *  whether the drop would actually change anything, without needing the whole AdminUser object
 *  threaded down through every section. */
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
