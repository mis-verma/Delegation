import { memo, useId, type ComponentType } from 'react';
import { useNavigate } from 'react-router';
import { Store, Building2, Users, ShieldCheck, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineError, Skeleton } from '../../../components';
import { STAT_FIGURE, STAT_SURFACE, STAT_SURFACE_ACTION } from '../../../components/statSurface';
import type { OrgCounts } from '../../../api/scores';
import { useCanOpen } from '../../owner/useReadOnlyViewer';

interface OrgSnapshotStripProps {
  counts: OrgCounts | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry?: () => void;
}

interface OrgTileProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string | number;
  caption: string;
  solid: string;
  captionClass?: string;
  to: string;
}

const ICON_TEXT: Record<string, string> = {
  'bg-vivid-blue': 'text-vivid-blue-text',
  'bg-vivid-sky': 'text-vivid-sky-text',
  'bg-vivid-green': 'text-vivid-green-text',
  'bg-vivid-red': 'text-vivid-red-text',
};

const TILE_CLASS = cn(STAT_SURFACE, 'group flex min-h-16 min-w-0 items-center gap-3 p-3 text-left');

const OrgTile = ({ icon: Icon, label, value, caption, solid, captionClass, to }: OrgTileProps) => {
  const navigate = useNavigate();
  const canOpen = useCanOpen();
  const body = (
    <>
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface', ICON_TEXT[solid] ?? 'text-text-secondary')} aria-hidden="true">
        <Icon className="size-5" strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className={cn('t-stat text-text', STAT_FIGURE)}>{value}</span>
          <span className="line-clamp-1 t-meta font-display font-bold text-text-secondary">{label}</span>
        </span>
        <span className={cn('line-clamp-1 t-meta font-medium text-text-muted', captionClass)}>{caption}</span>
      </span>
    </>
  );
  if (!canOpen(to)) {
    return <div role="group" aria-label={`${label}: ${value}. ${caption}`} className={TILE_CLASS}>{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => void navigate(to, { viewTransition: true })}
      aria-label={`${label}: ${value}. ${caption}. Open the directory`}
      className={cn(TILE_CLASS, STAT_SURFACE_ACTION, 'outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50')}
    >
      {body}
      <ChevronRight className="size-4 shrink-0 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
};

const OrgSnapshotStripBase = ({ counts, isPending, isError, onRetry }: OrgSnapshotStripProps) => {
  const headingId = useId();

  if (isError) {
    return (
      <section aria-labelledby={headingId}>
        <h2 id={headingId} className="sr-only">Your organisation</h2>
        <InlineError message="Could not load the organisation counts." onRetry={onRetry} />
      </section>
    );
  }

  if (isPending || !counts) {
    return (
      <section aria-labelledby={headingId}>
        <h2 id={headingId} className="sr-only">Your organisation</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label="Loading the organisation counts">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </section>
    );
  }

  const stores = counts.stores;
  const departments = counts.departments;
  const missingLeads = Math.max(0, departments.active - counts.departmentsWithLead);
  const inactive = (n: number) => (n > 0 ? `${n} inactive` : 'All active');

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">Your organisation</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OrgTile icon={Store} label="Stores" value={stores.active} caption={inactive(stores.inactive)} solid="bg-vivid-blue" to="/admin/directory?tab=stores" />
        <OrgTile icon={Building2} label="Departments" value={departments.active} caption={inactive(departments.inactive)} solid="bg-vivid-sky" to="/admin/directory?tab=departments" />
        <OrgTile
          icon={Users}
          label="Employees"
          value={counts.employees.active}
          caption={counts.employees.joinedLast30Days > 0 ? `${counts.employees.joinedLast30Days} joined in 30 days` : 'No new joiners in 30 days'}
          solid="bg-vivid-green"
          to="/admin/directory?tab=users"
        />
        <OrgTile
          icon={ShieldCheck}
          label="With a lead"
          value={`${counts.departmentsWithLead} of ${departments.active}`}
          caption={missingLeads > 0 ? `${missingLeads} still need a lead` : 'Every department has one'}
          captionClass={missingLeads > 0 ? 'text-vivid-red-text' : 'text-vivid-green-text'}
          solid={missingLeads > 0 ? 'bg-vivid-red' : 'bg-vivid-green'}
          to="/admin/directory?tab=departments"
        />
      </div>
    </section>
  );
};

export const OrgSnapshotStrip = memo(OrgSnapshotStripBase);
