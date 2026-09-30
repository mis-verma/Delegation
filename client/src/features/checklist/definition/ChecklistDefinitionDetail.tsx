import { useParams, useNavigate, Link } from 'react-router';
import {
  ArrowLeft,
  AlertCircle,
  Repeat,
  Users,
  Calendar,
  Pencil,
  Gauge,
  Camera,
  Store,
  ListTodo,
  AlertTriangle,
  ClipboardX,
} from 'lucide-react';
import { Skeleton, Breadcrumbs, formatWeekdays } from '../../../components';
import { Badge } from '@/components/ui/badge';
import { useChecklistDefinitionQuery, useInstancesForDefinitionQuery, useStoresQuery } from '../hook';
import { ApiError } from '../../../api/http';
import { ChecklistInstanceRow } from '../instance/ChecklistInstanceRow';
import {
  formatDate,
  instanceProgressStatus,
  INSTANCE_STATUS_LABEL,
  rateToneClass,
  rateBarClass,
  inverseRateToneClass,
  inverseRateBarClass,
  RECURRENCE_LABEL,
  isInstanceOverdue,
  type InstanceProgressStatus,
} from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';
import type { ChecklistDefinition } from '../../../api/checklistDefinitions';

const STATUS_ORDER: InstanceProgressStatus[] = ['TODO', 'IN_PROGRESS', 'COMPLETED'];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Why a checklist has no run yet — the same rules the server's generator applies
// (checklistInstanceGenerator.job.ts), so an admin sees the actual reason instead of "it'll show
// up automatically" while nothing ever does. Dates are the org's local (India) calendar day.
const noRunReason = (definition: ChecklistDefinition): string => {
  const localToday = new Date(Date.now() + 330 * 60_000);
  const todayKey = localToday.toISOString().slice(0, 10);
  const startKey = new Date(new Date(definition.startDate).getTime() + 330 * 60_000).toISOString().slice(0, 10);
  if (!definition.isActive) return 'This checklist is paused. Turn it back on to start creating runs.';
  if (startKey > todayKey) return `It starts on ${formatDate(definition.startDate)} — the first run is created that day.`;
  if (!definition.assigneeIds.length) return 'Nobody is assigned yet. Edit it and pick who fills it in.';
  if (definition.recurrence === 'DAILY' && definition.activeWeekdays && !definition.activeWeekdays.includes(localToday.getUTCDay())) {
    return `${DAY_NAMES[localToday.getUTCDay()]} isn't one of its working days (${formatWeekdays(definition.activeWeekdays)}). The next run is created on the next working day.`;
  }
  return `Today's run is created within the hour. If everyone assigned is on their week off today, there's no run today.`;
};

interface RateTileProps {
  icon: typeof Gauge;
  label: string;
  rate: number | null;
  emptyLabel: string;
  /** For rates where a HIGHER number is worse news (e.g. flagged-answer rate) — reads the same
   *  green/amber/red thresholds from the other end instead of showing a high bad number as green. */
  invert?: boolean;
}

const RateTile = ({ icon: Icon, label, rate, emptyLabel, invert = false }: RateTileProps) => {
  const toneClass = invert ? inverseRateToneClass : rateToneClass;
  const barClass = invert ? inverseRateBarClass : rateBarClass;
  return (
    <div className="flex flex-col gap-2.5 p-4 rounded-lg border border-border bg-surface flex-1 min-w-[12rem]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-display font-semibold text-text-muted">
          <Icon size={14} className="text-text-muted" />
          {label}
        </span>
        {rate !== null && (
          <span className={`text-[11px] font-display font-medium ${toneClass(rate)}`}>
            {rate}%
          </span>
        )}
      </div>

      {rate !== null ? (
        <>
          <p className={`font-display text-2xl sm:text-3xl font-bold tracking-tight ${toneClass(rate)}`}>
            {rate}%
          </p>
          <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ease-out ${barClass(rate)}`}
              style={{ width: `${rate}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-xs font-display text-text-muted py-2 italic">{emptyLabel}</p>
      )}
    </div>
  );
};

const groupByStatus = (instances: ChecklistInstance[]) =>
  STATUS_ORDER.map((status) => ({
    status,
    instances: instances.filter((i) => {
      const done = i.items.filter((x) => x.isDone).length;
      return instanceProgressStatus(done, i.items.length) === status;
    }),
  })).filter((group) => group.instances.length > 0);

export const ChecklistDefinitionDetail = () => {
  const { definitionId = '' } = useParams();
  const navigate = useNavigate();
  const { data: definition, isPending, isError, error, refetch } = useChecklistDefinitionQuery(definitionId);
  const isDeleted = error instanceof ApiError && error.status === 404;
  // The instance list is now paginated server-side (default 50). This panel shows a recent
  // history for one definition rather than an audit of all time, so it asks for the newest
  // 100 explicitly instead of silently receiving whatever the default happens to be.
  const { data: instances = [] } = useInstancesForDefinitionQuery(definitionId, { limit: 100 });
  const { data: stores = [] } = useStoresQuery();

  const storeNames = definition
    ? definition.storeIds
        .map((id) => stores.find((s) => s.id === id)?.name ?? 'Unknown store')
        .join(', ')
    : '';

  if (isPending) {
    return (
      <div className="flex flex-col gap-5 w-full max-w-4xl mx-auto py-4">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // A 404 here means the checklist was actually deleted, not a hiccup worth retrying — retrying
  // it just repeats the same doomed request (see lib/queryHelpers.ts's handleQueryRetry). Show
  // what actually happened and a way back, instead of a generic "check your connection" banner
  // whose Retry button can never succeed.
  if (isDeleted) {
    return (
      <div className="w-full max-w-4xl mx-auto py-16 flex flex-col items-center gap-3 text-center">
        <span className="flex items-center justify-center size-12 rounded-lg border border-border/60 bg-muted/60 text-text-muted">
          <ClipboardX className="size-6" strokeWidth={2.25} />
        </span>
        <h1 className="text-base font-display font-bold text-text">This checklist was deleted</h1>
        <p className="text-sm font-display text-text-muted max-w-sm">
          Its history is still on the Compliance Board if you need it — toggle "Show deleted checklists" there.
        </p>
        <Link
          to="/admin/scheduled-checklists"
          className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-display font-semibold border border-border bg-surface hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft size={13} />
          Back to checklists
        </Link>
      </div>
    );
  }

  if (isError || !definition) {
    return (
      <div className="w-full max-w-4xl mx-auto py-6">
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-display">
          <AlertCircle size={18} className="shrink-0" />
          <span className="flex-1">We couldn't load this checklist. Check your connection and try again.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto py-2 sm:py-4">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Admin', to: '/admin' },
          { label: 'Checklists', to: '/admin/scheduled-checklists' },
          { label: definition.name },
        ]}
      />

      {/* Top Bar Navigation & Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => navigate('/admin/scheduled-checklists')}
          className="inline-flex items-center gap-1.5 text-xs font-display font-medium text-text-secondary hover:text-text transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 rounded-md py-1 px-1.5"
        >
          <ArrowLeft size={14} />
          <span>Back to Templates</span>
        </button>

        <Link
          to={`/admin/scheduled-checklists/builder/${definition.id}`}
          // dark:bg-primary-500/15, not dark:bg-primary-950/40 — see ChecklistInstanceDetail.tsx's
          // own comment on this exact same button; primary-950 isn't a defined token here.
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-display font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-500/15 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/60 shadow-2xs transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
        >
          <Pencil size={12} />
          <span>Edit in Builder</span>
        </Link>
      </div>

      {/* Main Overview Card */}
      <div className="flex flex-col gap-4 p-5 sm:p-6 rounded-lg border border-border bg-surface">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-900/40 shrink-0 mt-0.5">
              <Repeat size={20} strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-display font-bold text-text tracking-tight truncate">
                {definition.name}
              </h1>
              {definition.description ? (
                <p className="text-xs sm:text-sm font-display text-text-muted mt-1 leading-relaxed">
                  {definition.description}
                </p>
              ) : (
                <p className="text-xs font-display text-text-muted/70 italic mt-0.5">
                  No description yet.
                </p>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <Badge variant={definition.isActive ? 'success' : 'neutral'} className="shrink-0">
            {definition.isActive ? 'Active' : 'Paused'}
          </Badge>
        </div>

        {/* Metadata Badges & Tags */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-display text-text-secondary pt-4 border-t border-border/60">
          <div className="flex items-center gap-1.5">
            <Store size={14} className="text-text-muted shrink-0" />
            <span className="truncate max-w-xs">{storeNames || 'No stores'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Repeat size={14} className="text-text-muted shrink-0" />
            <span>{RECURRENCE_LABEL[definition.recurrence] ?? definition.recurrence}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-text-muted shrink-0" />
            <span>{definition.assigneeIds.length} assigned</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-text-muted shrink-0" />
            <span>Starts {formatDate(definition.startDate)}</span>
          </div>
          <Badge variant="neutral" className="sm:ml-auto font-mono bg-muted/60">
            v{definition.version}
          </Badge>
        </div>
      </div>

      {/* Metric Rate Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <RateTile
          icon={Gauge}
          label="Completion rate"
          rate={definition.completionRate}
          emptyLabel="Nothing's been completed yet"
        />
        <RateTile
          icon={Camera}
          label="Photo compliance"
          rate={definition.qualityRate}
          emptyLabel="No photo checks on this checklist"
        />
        <RateTile
          icon={AlertTriangle}
          label="Flagged answers"
          rate={definition.issueRate}
          emptyLabel="No gated Yes/No questions on this checklist"
          invert
        />
      </div>

      {/* Past Runs Section */}
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-sm font-display font-bold text-text">
            Past runs ({instances.length}{instances.length === 100 ? '+' : ''})
          </h2>
        </div>

        {instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 py-10 px-4 rounded-xl border border-dashed border-border/80 bg-surface text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted/60 text-text-muted">
              <ListTodo size={18} />
            </span>
            <p className="text-xs font-display font-medium text-text">No runs yet</p>
            <p className="text-[11px] font-display text-text-muted max-w-xs">{noRunReason(definition)}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groupByStatus(instances).map((group) => {
              // TODO/IN_PROGRESS groups can hide overdue instances indistinguishably among
              // merely-not-yet-started ones — this is the only urgency signal at the group-header
              // level; without it, telling "how many of these are actually overdue" means reading
              // every row's own small chip individually. COMPLETED instances are never overdue.
              const overdueCount = group.status === 'COMPLETED'
                ? 0
                : group.instances.filter((i) => isInstanceOverdue(i, false)).length;
              return (
                <div key={group.status} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        group.status === 'COMPLETED' ? 'success' : group.status === 'IN_PROGRESS' ? 'info' : 'neutral'
                      }
                    >
                      {INSTANCE_STATUS_LABEL[group.status]}
                    </Badge>
                    <Badge variant="neutral" className="font-mono bg-muted/70">
                      {group.instances.length}
                    </Badge>
                    {overdueCount > 0 && (
                      <Badge variant="destructive" className="bg-danger/10">
                        {overdueCount} overdue
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {group.instances.map((instance) => (
                      <ChecklistInstanceRow key={instance.id} instance={instance} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};