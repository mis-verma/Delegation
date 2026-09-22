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
  /** A failed request used to fall through `stores ?? []` etc. into "0 Stores", "0 Departments" —
   *  reading as a genuinely empty org rather than a request that failed. Swaps every tile's value
   *  to '—' and its caption to a plain-text failure note instead (StatCard has no error/danger
   *  variant of its own to reach for here — this is the caption slot doing double duty). */
  isError: boolean;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// The owner-level "how big is my org, right now" glance — total stores, departments, headcount
// (with how many joined recently), and how many departments actually have a lead (MANAGER, this
// app's HOD) assigned. All four were previously only knowable by opening People & Teams and
// counting rows by hand; now it's the first thing on the dashboard, each tile deep-linking
// straight to the relevant tab.
export const OrgSnapshotStrip = ({ stores, departments, users, isPending, isError }: OrgSnapshotStripProps) => {
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
    // Single column on phones — at grid-cols-2, "Departments with a lead" has no room to breathe
    // next to its icon; two-up only once there's enough width for it (sm), four-up on desktop.
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      {/* Real icon tints, not the neutral-gray default every tile used before — Stores gets the
          same coral (gold) EntityIconTile already uses for physical stores elsewhere in the app,
          Departments/Employees stay in the primary navy family, and the coverage tile's color
          actually reports its own status (green once every department has a lead, amber while
          any are still missing one) rather than looking identical whether coverage is complete or
          not. */}
      <StatCard
        icon={Store}
        label="Stores"
        value={isError ? '—' : isPending ? '—' : stores.length}
        caption={isError ? "Couldn't load" : isPending ? undefined : `${stats.activeStores} active`}
        iconBgTint="bg-coral-50 dark:bg-coral-500/10"
        iconTint="text-coral-600 dark:text-coral-400"
        onClick={() => navigate('/admin/directory?tab=stores')}
      />
      <StatCard
        icon={Building2}
        label="Departments"
        value={isError ? '—' : isPending ? '—' : departments.length}
        caption={isError ? "Couldn't load" : isPending ? undefined : `${stats.activeDepartments} active`}
        iconBgTint="bg-primary-50 dark:bg-primary-500/10"
        iconTint="text-primary-600 dark:text-primary-400"
        onClick={() => navigate('/admin/directory?tab=departments')}
      />
      <StatCard
        icon={Users}
        label="Employees"
        value={isError ? '—' : isPending ? '—' : users.length}
        caption={isError ? "Couldn't load" : isPending || stats.newHires === 0 ? undefined : `${stats.newHires} new in last 30 days`}
        trend={!isError && !isPending && stats.newHires > 0 ? { direction: 'up', label: `+${stats.newHires}` } : undefined}
        iconBgTint="bg-primary-50 dark:bg-primary-500/10"
        iconTint="text-primary-600 dark:text-primary-400"
        onClick={() => navigate('/admin/directory?tab=users')}
      />
      <StatCard
        icon={ShieldCheck}
        label="Departments with a lead"
        value={isError ? '—' : isPending ? '—' : `${stats.hodCovered}/${departments.length}`}
        caption={isError ? "Couldn't load" : isPending ? undefined : stats.hodMissing > 0 ? `${stats.hodMissing} need a lead assigned` : 'Fully covered'}
        iconBgTint={!isError && !isPending && stats.hodMissing === 0 ? 'bg-success/10' : 'bg-warning/10'}
        iconTint={!isError && !isPending && stats.hodMissing === 0 ? 'text-success' : 'text-warning'}
        onClick={() => navigate('/admin/directory?tab=departments')}
      />
    </div>
  );
};
