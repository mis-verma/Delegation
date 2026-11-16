import type { AdminUser, UserPresence } from '../../../api/admin';
import type { LeaveEntry } from '../../../api/leave';
import { countOrg, type OrgCounts } from './orgCounts';

export interface NamedRow {
  id: string;
  name: string;
  isActive: boolean;
}

export interface SnapshotRow {
  id: string;
  label: string;
  count: number;
}

export interface OrgSnapshot {
  counts: OrgCounts;
  onLeave: number | null;
  notSignedIn: number | null;
  online: number | null;
  onlineByStore: SnapshotRow[];
  topDepartments: SnapshotRow[];
  storeHeadcounts: SnapshotRow[];
}

const TOP_DEPARTMENTS = 4;

const dayOf = (iso: string): string => iso.slice(0, 10);

const tally = (ids: Iterable<string | null>): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
};

const rowsOf = (named: readonly NamedRow[], counts: Map<string, number>): SnapshotRow[] =>
  named
    .filter((n) => n.isActive)
    .map((n) => ({ id: n.id, label: n.name, count: counts.get(n.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

export const buildOrgSnapshot = (
  users: AdminUser[] | undefined,
  departments: NamedRow[] | undefined,
  stores: NamedRow[] | undefined,
  presence: UserPresence[] | undefined,
  leave: LeaveEntry[] | undefined,
  today: string,
): OrgSnapshot => {
  const active = (users ?? []).filter((u) => u.isActive);
  const activeIds = new Set(active.map((u) => u.id));
  const onlineIds = new Set((presence ?? []).filter((p) => p.online && activeIds.has(p.id)).map((p) => p.id));
  const storeOf = new Map(active.map((u) => [u.id, u.storeId]));

  const leaveIds = new Set(
    (leave ?? [])
      .filter((l) => l.status === 'APPROVED' && dayOf(l.startDate) <= today && today <= dayOf(l.endDate) && activeIds.has(l.userId))
      .map((l) => l.userId),
  );

  return {
    counts: countOrg(users, departments, stores),
    onLeave: leave ? leaveIds.size : null,
    notSignedIn: presence ? presence.filter((p) => activeIds.has(p.id) && !p.online && p.lastActiveAt === null).length : null,
    online: users && presence ? onlineIds.size : null,
    onlineByStore: rowsOf(stores ?? [], tally([...onlineIds].map((id) => storeOf.get(id) ?? null))),
    topDepartments: rowsOf(departments ?? [], tally(active.map((u) => u.departmentId))).slice(0, TOP_DEPARTMENTS),
    storeHeadcounts: rowsOf(stores ?? [], tally(active.map((u) => u.storeId))),
  };
};
