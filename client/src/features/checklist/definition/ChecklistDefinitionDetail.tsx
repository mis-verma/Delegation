import { memo, useMemo } from 'react';
import {
  ArrowLeft,
  Repeat,
  Users,
  Calendar,
  Pencil,
  Copy,
  Gauge,
  Camera,
  Store,
  ListTodo,
  AlertTriangle,
  ClipboardX,
  type LucideIcon,
} from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router';
import { Skeleton, Breadcrumbs, Button, EmptyState, InlineError, Loader, Switch, PANEL_CLASS, formatWeekdays } from '../../../components';
import { ChecklistIconTile } from './ChecklistIconTile';
import { IconChip } from '../../../components/iconChip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '../../../context/AuthContext';
import { useChecklistDefinitionQuery, useInstancesForDefinitionQuery, useStoresQuery, useSetChecklistDefinitionActiveMutation } from '../hook';
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
  orgDayKey,
  orgWeekday,
  plural,
  RECURRENCE_LABEL,
  isInstanceOverdue,
  type InstanceProgressStatus,
} from '../checklistDisplay';
import { CHECKLIST_ICON_MAP } from './checklistIconMap';
import { RESPONSE_MODE_ICON, RESPONSE_MODE_LABEL } from './form/formConstants';
import type { ChecklistInstance } from '../../../api/checklistInstances';
import type { ChecklistDefinition } from '../../../api/checklistDefinitions';

const STATUS_ORDER: InstanceProgressStatus[] = ['TODO', 'IN_PROGRESS', 'COMPLETED'];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LIST_PATH = '/admin/scheduled-checklists';
const INSTANCE_LIMIT = 100;

// Why a checklist has no run yet — the same rules the server's generator applies
// (checklistInstanceGenerator.job.ts), so an admin sees the actual reason instead of "it'll show
// up automatically" while nothing ever does. Dates are the org's local (India) calendar day.
const noRunReason = (definition: ChecklistDefinition): string => {
  const todayKey = orgDayKey(Date.now());
  const startKey = orgDayKey(new Date(definition.startDate).getTime());
  const weekday = orgWeekday();
  if (!definition.isActive) return 'This checklist is paused. Resume it with the status button at the top of this page to start creating runs.';
  if (startKey > todayKey) return `It starts on ${formatDate(definition.startDate)}, and the first run is created that day.`;
  if (!definition.assigneeIds.length) return 'Nobody is assigned yet. Edit it and pick who fills it in.';
  if (definition.recurrence === 'DAILY' && definition.activeWeekdays && !definition.activeWeekdays.includes(weekday)) {
    return `${DAY_NAMES[weekday]} isn't one of its working days (${formatWeekdays(definition.activeWeekdays)}). The next run is created on the next working day.`;
  }
  return `Today's run is created within the hour. If everyone assigned is on their week off today, there's no run today.`;
};

interface RateTileProps {
  icon: LucideIcon;
  label: string;
  rate: number | null;
  emptyLabel: string;
  /** For rates where a HIGHER number is worse news (e.g. flagged-answer rate) — reads the same
   *  green/amber/red thresholds from the other end instead of showing a high bad number as green. */
  invert?: boolean;
  /** For a live fill (today's / this run's progress): neutral text, green once done, not the
   *  good/bad rate colours, which would paint a half-filled morning run red. */
  live?: boolean;
  /** One line saying what the number covers. */
  caption?: string;
}

const RateTile = memo(function RateTile({ icon: Icon, label, rate, emptyLabel, invert = false, live = false, caption }: RateTileProps) {
  const toneClass = live ? (r: number) => (r === 100 ? 'text-success' : 'text-text') : invert ? inverseRateToneClass : rateToneClass;
  const barClass = live ? (r: number) => (r === 100 ? 'bg-success' : 'bg-primary-500') : invert ? inverseRateBarClass : rateBarClass;
  return (
    // Below sm the tile is a compact row (label left, number right, bar underneath); from sm up it
    // is the stacked tile.
    <div className={cn(PANEL_CLASS, 'grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-3 sm:flex sm:flex-col sm:items-stretch sm:gap-2.5 sm:p-4')}>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-display font-semibold text-text-muted">
          <Icon size={14} className="text-text-muted shrink-0" />
          {label}
        </span>
        {caption && <span className="t-meta font-display text-text-muted leading-snug">{caption}</span>}
      </div>

      {rate !== null ? (
        <>
          <p className={cn('font-display text-2xl sm:text-3xl font-bold tracking-tight', toneClass(rate))}>
            {rate}%
          </p>
          {/* Coloured by how good the rate is (red/amber/green), not by done/total, so this stays
              a hand-built track rather than ChecklistProgressBar. */}
          <div className="col-span-2 h-1.5 w-full rounded-full bg-surface-hover overflow-hidden">
            <div
              className={cn('h-full w-full rounded-full origin-left transition-transform duration-500 ease-out', barClass(rate))}
              style={{ transform: `scaleX(${rate / 100})` }}
            />
          </div>
        </>
      ) : (
        <p className="col-span-2 text-xs font-display text-text-muted sm:py-2 italic">{emptyLabel}</p>
      )}
    </div>
  );
});

const groupByStatus = (instances: ChecklistInstance[]) =>
  STATUS_ORDER.map((status) => {
    const inGroup = instances.filter((i) => {
      const done = i.items.filter((x) => x.isDone).length;
      return instanceProgressStatus(done, i.items.length) === status;
    });
    // TODO/IN_PROGRESS groups can hide overdue instances indistinguishably among merely-not-yet-
    // started ones — this is the only urgency signal at the group-header level; without it,
    // telling "how many of these are actually overdue" means reading every row's own small chip.
    // COMPLETED instances are never overdue.
    const overdueCount = status === 'COMPLETED' ? 0 : inGroup.filter((i) => isInstanceOverdue(i, false)).length;
    return { status, instances: inGroup, overdueCount };
  }).filter((group) => group.instances.length > 0);

const PageSkeleton = () => (
  <div className="flex flex-col gap-6 w-full py-2 sm:py-4" aria-busy="true">
    <Skeleton className="h-5 w-64" />
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-8 w-44 rounded-md" />
      <Skeleton className="h-8 w-40 rounded-md" />
    </div>
    <Skeleton className="min-h-40 w-full rounded-2xl" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Skeleton className="min-h-28 w-full rounded-2xl" />
      <Skeleton className="min-h-28 w-full rounded-2xl" />
      <Skeleton className="min-h-28 w-full rounded-2xl" />
    </div>
  </div>
);

export const ChecklistDefinitionDetail = () => {
  const { definitionId = '' } = useParams();
  const navigate = useNavigate();
  const { data: definition, isPending, isError, error, refetch } = useChecklistDefinitionQuery(definitionId);
  const isDeleted = error instanceof ApiError && error.status === 404;
  // The instance list is now paginated server-side (default 50). This panel shows a recent
  // history for one definition rather than an audit of all time, so it asks for the newest
  // 100 explicitly instead of silently receiving whatever the default happens to be.
  const {
    data: instances,
    isPending: instancesPending,
    isError: instancesError,
    refetch: refetchInstances,
  } = useInstancesForDefinitionQuery(definitionId, { limit: INSTANCE_LIMIT });
  const { data: stores } = useStoresQuery();

  const { user } = useAuth();
  const setActiveMutation = useSetChecklistDefinitionActiveMutation();
  // ADMIN and PC manage checklists alike (the server allows both).
  const canManage = user?.role === 'ADMIN' || user?.role === 'PC';

  // Names only for the tooltip on "N stores". Not "Unknown store" until the stores list has loaded.
  const storeNames = useMemo(() => {
    if (!definition || !stores) return null;
    const nameById = new Map(stores.map((s) => [s.id, s.name]));
    return definition.storeIds.map((id) => nameById.get(id) ?? 'Unknown store').join(', ');
  }, [definition, stores]);

  const groups = useMemo(() => groupByStatus(instances ?? []), [instances]);

  if (isPending) return <PageSkeleton />;

  // A 404 here means the checklist was actually deleted, not a hiccup worth retrying — retrying
  // it just repeats the same doomed request (see lib/queryHelpers.ts's handleQueryRetry). Show
  // what actually happened and a way back, instead of a generic "check your connection" banner
  // whose Retry button can never succeed.
  if (isDeleted) {
    return (
      <div className="w-full py-8">
        <EmptyState
          icon={ClipboardX}
          title="This checklist was deleted"
          description={'Its history is still on the Compliance Board. Turn on "Show deleted checklists" there to see it.'}
          action={{ label: 'Back to Recurring Checklists', icon: ArrowLeft, onClick: () => navigate(LIST_PATH) }}
        />
      </div>
    );
  }

  if (isError || !definition) {
    return (
      <div className="w-full py-6">
        <InlineError message="We couldn't load this checklist. Check your connection and try again." onRetry={() => refetch()} />
      </div>
    );
  }

  const ResponseIcon = RESPONSE_MODE_ICON[definition.responseMode];

  return (
    <div className="flex flex-col gap-6 w-full py-2 sm:py-4">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Admin', to: '/admin' },
          { label: 'Recurring Checklists', to: LIST_PATH },
          { label: definition.name },
        ]}
      />

      {/* Actions (the breadcrumb above is the way back). Duplicate is icon-only on a phone. */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-w-11 sm:min-w-0"
          title="Make a new checklist with the same stores, people, schedule and questions"
          aria-label="Duplicate checklist"
          onClick={() => navigate(`${LIST_PATH}/builder?copyFrom=${definition.id}`)}
        >
          <Copy size={14} />
          <span className="hidden sm:inline">Duplicate</span>
        </Button>
        <Button variant="primary" size="sm" onClick={() => navigate(`${LIST_PATH}/builder/${definition.id}`)}>
          <Pencil size={14} />
          <span>Edit in Builder</span>
        </Button>
      </div>

      {/* Main Overview Card */}
      <div className={cn(PANEL_CLASS, 'flex flex-col gap-4 p-5 sm:p-6')}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            <ChecklistIconTile icon={CHECKLIST_ICON_MAP[definition.icon]} name={definition.name} />
            <div className="flex flex-col gap-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-display font-bold text-text tracking-tight leading-snug line-clamp-2 break-words">
                {definition.name}
              </h1>
              {definition.description ? (
                <p className="text-xs sm:text-sm font-display text-text-muted leading-relaxed">
                  {definition.description}
                </p>
              ) : (
                <p className="text-xs font-display text-text-muted italic">
                  No description yet.
                </p>
              )}
            </div>
          </div>

          {/* Same pause/resume toggle as the card; read-only roles just see the state. */}
          {canManage ? (
            <label className="flex items-center gap-2 min-h-11 sm:min-h-9 shrink-0 cursor-pointer">
              <span className={cn('text-xs font-display font-semibold', definition.isActive ? 'text-text-secondary' : 'text-text-muted')}>
                {definition.isActive ? 'Active' : 'Paused'}
              </span>
              {setActiveMutation.isPending ? (
                <span className="flex h-6 w-11 items-center justify-center"><Loader size="sm" variant="slate" className="size-4" /></span>
              ) : (
                <Switch checked={definition.isActive} onChange={(next) => setActiveMutation.mutate({ id: definition.id, isActive: next })} />
              )}
              <span className="sr-only">{definition.isActive ? 'Pause' : 'Resume'} {definition.name}</span>
            </label>
          ) : (
            <Badge variant={definition.isActive ? 'success' : 'neutral'} className="shrink-0">
              {definition.isActive ? 'Active' : 'Paused'}
            </Badge>
          )}
        </div>

        {/* Metadata Badges & Tags */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-display text-text-secondary pt-4 border-t border-border/60">
          <div className="flex items-center gap-1.5">
            <Store size={14} className="text-text-muted shrink-0" />
            {definition.storeIds.length === 0 ? (
              <span>No stores</span>
            ) : (
              <span
                title={storeNames ?? undefined}
                className={cn(storeNames && 'cursor-help underline decoration-dotted decoration-text-light underline-offset-4')}
              >
                {plural(definition.storeIds.length, 'store')}
              </span>
            )}
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
          <IconChip icon={ResponseIcon} tone="bg-primary-600" label={RESPONSE_MODE_LABEL[definition.responseMode]} />
          <Badge variant="neutral" className="sm:ml-auto font-mono bg-muted/60">
            v{definition.version}
          </Badge>
        </div>
      </div>

      {/* Metric Rate Tiles */}
      <div className={cn('grid grid-cols-1 gap-3 sm:gap-4', definition.currentRate !== null ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3')}>
        {definition.currentRate !== null && (
          <RateTile
            icon={Gauge}
            label={definition.recurrence === 'DAILY' ? 'Today' : 'This run'}
            rate={definition.currentRate}
            emptyLabel=""
            live
          />
        )}
        <RateTile
          icon={Gauge}
          label="All time"
          caption="Every run since it started"
          rate={definition.completionRate}
          emptyLabel="Nothing's been completed yet"
        />
        <RateTile
          icon={Camera}
          label="Photo proof"
          rate={definition.qualityRate}
          emptyLabel="No photo checks on this checklist"
        />
        <RateTile
          icon={AlertTriangle}
          label="Flagged"
          rate={definition.issueRate}
          emptyLabel="No gated Yes/No questions on this checklist"
          invert
        />
      </div>

      {/* Runs Section */}
      <section className="flex flex-col gap-4" aria-labelledby="runs-heading">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 id="runs-heading" className="text-sm font-display font-bold text-text">
            Runs{instances ? ` (${instances.length}${instances.length === INSTANCE_LIMIT ? '+' : ''})` : ''}
          </h2>
          {instances && instances.length >= INSTANCE_LIMIT && (
            <Link
              to="/admin/checklist-compliance"
              className="inline-flex items-center min-h-11 sm:min-h-0 text-xs font-display font-medium text-primary-600 dark:text-primary-400 hover:underline underline-offset-2"
            >
              Showing the latest {INSTANCE_LIMIT}. See every run on the Compliance board
            </Link>
          )}
        </div>

        {instancesPending ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="min-h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : instancesError ? (
          <InlineError message="We couldn't load the runs. Check your connection and try again." onRetry={() => refetchInstances()} />
        ) : groups.length === 0 ? (
          <EmptyState icon={ListTodo} title="No runs yet" description={noRunReason(definition)} />
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
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
                  {group.overdueCount > 0 && (
                    <Badge variant="destructive" className="bg-danger/10">
                      {group.overdueCount} overdue
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {group.instances.map((instance) => (
                    <ChecklistInstanceRow key={instance.id} instance={instance} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
