import type { AdminUser } from '../../../api/admin';
import type { Department } from '../../../api/departments';
import type { Store } from '../../../api/stores';
import { ROLE_LABEL } from '../roleBadge';
import { fullName, isDepartmentHead } from './orgStructureDisplay';

export interface PersonNode {
  id: string;
  user: AdminUser;
  reports: PersonNode[];
  descendants: number;
}

export interface DepartmentBranch {
  id: string;
  department: Department;
  leads: PersonNode[];
  headcount: number;
}

export interface StoreBranch {
  id: string;
  store: Store | null;
  departments: DepartmentBranch[];
  headcount: number;
}

export interface PeopleTree {
  stores: StoreBranch[];
  floating: PersonNode[];
  parentOf: ReadonlyMap<string, string>;
  hasChildren: ReadonlySet<string>;
  userNodes: ReadonlyMap<string, PersonNode>;
}

export const storeKey = (id: string | null) => `store:${id ?? 'none'}`;
export const deptKey = (id: string) => `dept:${id}`;
export const userKey = (id: string) => `user:${id}`;

const byLeadThenName = (a: PersonNode, b: PersonNode): number =>
  Number(isDepartmentHead(b.user)) - Number(isDepartmentHead(a.user)) || b.descendants - a.descendants || fullName(a.user).localeCompare(fullName(b.user));

const countDescendants = (node: PersonNode): number => {
  node.descendants = node.reports.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
  return node.descendants;
};

const buildBranch = (members: AdminUser[], nodes: Map<string, PersonNode>): PersonNode[] => {
  const present = new Set(members.map((u) => u.id));
  const roots: PersonNode[] = [];
  for (const user of members) {
    const node: PersonNode = { id: user.id, user, reports: [], descendants: 0 };
    nodes.set(user.id, node);
  }
  for (const user of members) {
    const node = nodes.get(user.id)!;
    const boss = user.reportsToId && user.reportsToId !== user.id && present.has(user.reportsToId) ? nodes.get(user.reportsToId) : undefined;
    if (boss) boss.reports.push(node);
    else roots.push(node);
  }

  const seen = new Set<string>();
  const visit = (node: PersonNode) => {
    seen.add(node.id);
    node.reports.forEach((child) => { if (!seen.has(child.id)) visit(child); });
  };
  roots.forEach(visit);
  for (const user of members) {
    if (seen.has(user.id)) continue;
    const node = nodes.get(user.id)!;
    const stale = nodes.get(user.reportsToId ?? '');
    if (stale) stale.reports = stale.reports.filter((child) => child.id !== node.id);
    roots.push(node);
    visit(node);
  }

  roots.forEach(countDescendants);
  const sortDeep = (list: PersonNode[]) => { list.sort(byLeadThenName); list.forEach((n) => sortDeep(n.reports)); };
  sortDeep(roots);
  return roots;
};

export const buildPeopleTree = (stores: readonly Store[], departments: readonly Department[], users: readonly AdminUser[], includeInactive: boolean): PeopleTree => {
  const people = includeInactive ? users : users.filter((u) => u.isActive);
  const nodes = new Map<string, PersonNode>();

  const byDepartment = new Map<string, AdminUser[]>();
  const loose: AdminUser[] = [];
  const departmentIds = new Set(departments.map((d) => d.id));
  for (const user of people) {
    if (user.departmentId && departmentIds.has(user.departmentId)) {
      const list = byDepartment.get(user.departmentId) ?? [];
      list.push(user);
      byDepartment.set(user.departmentId, list);
    } else loose.push(user);
  }

  const branches = new Map<string, DepartmentBranch[]>();
  for (const department of departments) {
    if (!department.isActive && !includeInactive) continue;
    const members = byDepartment.get(department.id) ?? [];
    const branch: DepartmentBranch = { id: department.id, department, leads: buildBranch(members, nodes), headcount: members.length };
    const key = department.storeId ?? '';
    branches.set(key, [...(branches.get(key) ?? []), branch]);
  }
  const sortBranches = (list: DepartmentBranch[]) => list.sort((a, b) => a.department.name.localeCompare(b.department.name));

  const storeBranches: StoreBranch[] = stores
    .filter((s) => s.isActive || includeInactive)
    .map((store) => {
      const list = sortBranches(branches.get(store.id) ?? []);
      return { id: store.id, store, departments: list, headcount: list.reduce((n, d) => n + d.headcount, 0) };
    })
    .sort((a, b) => (a.store?.name ?? '').localeCompare(b.store?.name ?? ''));
  const noStore = sortBranches(branches.get('') ?? []);
  if (noStore.length) storeBranches.push({ id: 'none', store: null, departments: noStore, headcount: noStore.reduce((n, d) => n + d.headcount, 0) });

  const floating = buildBranch(loose, nodes);

  const parentOf = new Map<string, string>();
  const hasChildren = new Set<string>();
  const linkPeople = (list: PersonNode[], parent: string) => {
    for (const node of list) {
      parentOf.set(userKey(node.id), parent);
      if (node.reports.length) {
        hasChildren.add(userKey(node.id));
        linkPeople(node.reports, userKey(node.id));
      }
    }
  };
  for (const s of storeBranches) {
    parentOf.set(storeKey(s.store?.id ?? null), '');
    hasChildren.add(storeKey(s.store?.id ?? null));
    for (const d of s.departments) {
      parentOf.set(deptKey(d.id), storeKey(s.store?.id ?? null));
      if (d.leads.length) hasChildren.add(deptKey(d.id));
      linkPeople(d.leads, deptKey(d.id));
    }
  }
  linkPeople(floating, '');

  return { stores: storeBranches, floating, parentOf, hasChildren, userNodes: nodes };
};

export interface SearchResult {
  matches: ReadonlySet<string>;
  open: ReadonlySet<string>;
  first: string | null;
}

const NO_MATCHES: SearchResult = { matches: new Set(), open: new Set(), first: null };

export const searchPeople = (tree: PeopleTree, query: string): SearchResult => {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return NO_MATCHES;
  const matches = new Set<string>();
  const open = new Set<string>();
  let first: string | null = null;
  for (const [id, node] of tree.userNodes) {
    const haystack = `${fullName(node.user)} ${node.user.email} ${node.user.employeeId ?? ''} ${ROLE_LABEL[node.user.role]}`.toLowerCase();
    if (!tokens.every((t) => haystack.includes(t))) continue;
    matches.add(id);
    first ??= id;
    let cursor = tree.parentOf.get(userKey(id));
    while (cursor) {
      open.add(cursor);
      cursor = tree.parentOf.get(cursor);
    }
  }
  return { matches, open, first };
};
