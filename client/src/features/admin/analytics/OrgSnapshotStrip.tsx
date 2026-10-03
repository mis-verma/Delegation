import { memo, useId, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Store, Building2, Users, ShieldCheck } from 'lucide-react';
import { InlineError } from '../../../components';
import { StatTile } from './AnalyticsSummaryStrip';
import type { AdminUser } from '../../../api/admin';
import type { Department } from '../../../api/departments';
import type { Store as StoreType } from '../../../api/stores';

interface OrgSnapshotStripProps {
  stores: StoreType[];
  departments: Department[];
  users: AdminUser[];
  isPending: boolean;
  /** A failed request used to fall through `stores ?? []` into "0 Stores", reading as an empty org
   *  rather than a request that failed. Shows a retryable error and keeps every tile off a number. */
  isError: boolean;
  onRetry?: () => void;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// The shape of the organisation, as the last thing on the Overview: how many stores, departments
// and people are active, and how many departments have a lead. Every figure counts active records
// only, so a closed store or a person who has left does not inflate it. Each tile opens the matching
// tab of People & Teams.
const OrgSnapshotStripBase = ({ stores, departments, users, isPending, isError, onRetry }: OrgSnapshotStripProps) => {
  const headingId = useId();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const activeStores = stores.filter((s) => s.isActive);
    const activeDepartments = departments.filter((d) => d.isActive);
    const activeUsers = users.filter((u) => u.isActive);

    // "now" only needs to be approximately current for this 30-day window.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const newHires = activeUsers.filter((u) => now - new Date(u.createdAt).getTime() <= THIRTY_DAYS_MS).length;

    // MANAGER is this app's Head of Department (HOD), see the ROLE_RANK comment in the schema.
    const departmentsWithHod = new Set(activeUsers.filter((u) => u.role === 'MANAGER' && u.departmentId).map((u) => u.departmentId));
    const hodCovered = activeDepartments.filter((d) => departmentsWithHod.has(d.id)).length;

    return {
      activeStores: activeStores.length,
      inactiveStores: stores.length - activeStores.length,
      activeDepartments: activeDepartments.length,
      inactiveDepartments: departments.length - activeDepartments.length,
      activeUsers: activeUsers.length,
      newHires,
      hodCovered,
      hodMissing: activeDepartments.length - hodCovered,
    };
  }, [stores, departments, users]);

  const unavailable = isPending || isError;
  // Written out, never a bare dash standing in for a number.
  const PLACEHOLDER = isError ? 'No data' : 'Loading';
  const caption = (text: string) => (isError ? "Couldn't load" : isPending ? undefined : text);
  const inactiveNote = (count: number) => (count > 0 ? `${count} inactive` : 'All active');

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 sm:gap-4">
      <h2 id={headingId} className="text-lg sm:text-xl font-display font-bold text-text">Your organisation</h2>

      {isError && <InlineError message="Could not load the organisation counts." onRetry={onRetry} />}

      <div className="@container">
        {/* Two-up tiles on a phone; four across only once the column itself is wide enough. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 @4xl:grid-cols-4">
          <StatTile
            icon={Store}
            label="Stores"
            value={unavailable ? PLACEHOLDER : stats.activeStores}
            isLoading={isPending}
            caption={caption(inactiveNote(stats.inactiveStores))}
            iconBgTint="bg-coral-50 dark:bg-coral-500/10"
            iconTint="text-coral-600 dark:text-coral-400"
            onClick={() => navigate('/admin/directory?tab=stores')}
          />
          <StatTile
            icon={Building2}
            label="Departments"
            value={unavailable ? PLACEHOLDER : stats.activeDepartments}
            isLoading={isPending}
            caption={caption(inactiveNote(stats.inactiveDepartments))}
            iconBgTint="bg-primary-50 dark:bg-primary-500/10"
            iconTint="text-primary-600 dark:text-primary-400"
            onClick={() => navigate('/admin/directory?tab=departments')}
          />
          <StatTile
            icon={Users}
            label="Employees"
            value={unavailable ? PLACEHOLDER : stats.activeUsers}
            isLoading={isPending}
            caption={caption(stats.newHires > 0 ? `${stats.newHires} joined in the last 30 days` : 'No new joiners in 30 days')}
            iconBgTint="bg-primary-50 dark:bg-primary-500/10"
            iconTint="text-primary-600 dark:text-primary-400"
            onClick={() => navigate('/admin/directory?tab=users')}
          />
          <StatTile
            icon={ShieldCheck}
            label="Departments with a lead"
            value={unavailable ? PLACEHOLDER : `${stats.hodCovered} of ${stats.activeDepartments}`}
            isLoading={isPending}
            caption={caption(stats.hodMissing > 0 ? `${stats.hodMissing} still need a lead` : 'Every department has one')}
            iconBgTint={!unavailable && stats.hodMissing === 0 ? 'bg-success/10' : 'bg-warning/10'}
            iconTint={!unavailable && stats.hodMissing === 0 ? 'text-success' : 'text-warning'}
            onClick={() => navigate('/admin/directory?tab=departments')}
          />
        </div>
      </div>
    </section>
  );
};

export const OrgSnapshotStrip = memo(OrgSnapshotStripBase);
