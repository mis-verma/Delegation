import { memo, useId } from 'react';
import { useNavigate } from 'react-router';
import { Store, Building2, Users, ShieldCheck } from 'lucide-react';
import { InlineError } from '../../../components';
import { StatTile } from './AnalyticsSummaryStrip';
import type { OrgCounts } from '../../../api/scores';

interface OrgSnapshotStripProps {
  /** From the small org-counts request, not the whole roster. */
  counts: OrgCounts | undefined;
  isPending: boolean;
  /** A failed request used to fall through into "0 Stores", reading as an empty org rather than a
   *  request that failed. Shows a retryable error and keeps every tile off a number. */
  isError: boolean;
  onRetry?: () => void;
}

// The shape of the organisation, below the performance cards: how many stores, departments and people
// are active, and how many departments have a lead (a Manager or a Senior). Every figure counts active
// records only, so a closed store or a person who has left does not inflate it. Each tile opens the
// matching tab of People & Teams.
const OrgSnapshotStripBase = ({ counts, isPending, isError, onRetry }: OrgSnapshotStripProps) => {
  const headingId = useId();
  const navigate = useNavigate();

  const stats = {
    activeStores: counts?.stores.active ?? 0,
    inactiveStores: counts?.stores.inactive ?? 0,
    activeDepartments: counts?.departments.active ?? 0,
    inactiveDepartments: counts?.departments.inactive ?? 0,
    activeUsers: counts?.employees.active ?? 0,
    newHires: counts?.employees.joinedLast30Days ?? 0,
    hodCovered: counts?.departmentsWithLead ?? 0,
    hodMissing: Math.max(0, (counts?.departments.active ?? 0) - (counts?.departmentsWithLead ?? 0)),
  };

  const unavailable = isPending || isError;
  // Written out, never a bare dash standing in for a number.
  const PLACEHOLDER = isError ? 'No data' : 'Loading';
  const caption = (text: string) => (isError ? "Couldn't load" : isPending ? undefined : text);
  const inactiveNote = (count: number) => (count > 0 ? `${count} inactive` : 'All active');

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 sm:gap-4">
      <h2 id={headingId} className="t-section font-display font-bold text-text">Your organisation</h2>

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
