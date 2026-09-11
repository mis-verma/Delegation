import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Store, Building2, Users, ShieldCheck } from 'lucide-react';
import { StatCard } from '../../dashboard';
import type { AdminUser } from '../../../api/admin';
import type { Department } from '../../../api/departments';
import type { Store as StoreType } from '../../../api/stores';

interface OrgSnapshotStripProps {
  stores: StoreType[];
  departments: Department[];
  users: AdminUser[];
  isPending: boolean;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// The owner-level "how big is my org, right now" glance — total stores, departments, headcount
// (with how many joined recently), and how many departments actually have a lead (MANAGER, this
// app's HOD) assigned. All four were previously only knowable by opening People & Teams and
// counting rows by hand; now it's the first thing on the dashboard, each tile deep-linking
// straight to the relevant tab.
export const OrgSnapshotStrip = ({ stores, departments, users, isPending }: OrgSnapshotStripProps) => {
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const activeStores = stores.filter((s) => s.isActive).length;
    const activeDepartments = departments.filter((d) => d.isActive).length;

    // "now" only needs to be approximately current for this 30-day window — see
    // TeamLeaderboardRail.tsx for the same pattern.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const newHires = users.filter((u) => now - new Date(u.createdAt).getTime() <= THIRTY_DAYS_MS).length;

    // MANAGER is this app's Head of Department (HOD) — see the ROLE_RANK comment in the schema.
    const departmentsWithHod = new Set(
      users.filter((u) => u.role === 'MANAGER' && u.departmentId).map((u) => u.departmentId)
    );
    const hodCovered = departments.filter((d) => departmentsWithHod.has(d.id)).length;
    const hodMissing = departments.length - hodCovered;

    return { activeStores, activeDepartments, newHires, hodCovered, hodMissing };
  }, [stores, departments, users]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      <StatCard
        icon={Store}
        label="Stores"
        value={isPending ? '—' : stores.length}
        caption={isPending ? undefined : `${stats.activeStores} active`}
        onClick={() => navigate('/admin/directory?tab=stores')}
      />
      <StatCard
        icon={Building2}
        label="Departments"
        value={isPending ? '—' : departments.length}
        caption={isPending ? undefined : `${stats.activeDepartments} active`}
        onClick={() => navigate('/admin/directory?tab=departments')}
      />
      <StatCard
        icon={Users}
        label="Employees"
        value={isPending ? '—' : users.length}
        caption={isPending || stats.newHires === 0 ? undefined : `${stats.newHires} new in last 30 days`}
        trend={!isPending && stats.newHires > 0 ? { direction: 'up', label: `+${stats.newHires}` } : undefined}
        onClick={() => navigate('/admin/directory?tab=users')}
      />
      <StatCard
        icon={ShieldCheck}
        label="Departments with a lead"
        value={isPending ? '—' : `${stats.hodCovered}/${departments.length}`}
        caption={isPending ? undefined : stats.hodMissing > 0 ? `${stats.hodMissing} need a lead assigned` : 'Fully covered'}
        onClick={() => navigate('/admin/directory?tab=departments')}
      />
    </div>
  );
};
