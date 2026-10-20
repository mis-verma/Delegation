import { useMemo, type ReactNode } from 'react';
import {
  Pencil,
  AlertTriangle,
  CheckCircle2,
  Store,
  Repeat,
  Calendar,
  Clock,
  Users,
  FileText,
  ListChecks,
  UserCheck,
  ShieldCheck,
  Layers,
  Info,
  PauseCircle,
} from 'lucide-react';
import { Button, IconChip, InlineError, NoticeBanner, PANEL_CLASS, Skeleton, formatWeekdays } from '../../../../../components';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useStoresQuery, useAssignableUsersQuery } from '../../../hook';
import { RECURRENCE_LABEL, formatDate } from '../../../checklistDisplay';
import { isOvernightWindow } from '../BuilderSchedulePanel';
import { RESPONSE_MODE_TITLE } from '../BuilderAssignPanel';
import type { ItemDraft } from '../../ChecklistDefinitionItemDraftRow';
import { questionTypeOf } from '../questionTypes';
import type { ChecklistRecurrence, ChecklistResponseMode } from '../../../../../api/checklistDefinitions';

interface BuilderReviewStepProps {
  name: string;
  description: string;
  storeIds: string[];
  recurrence: ChecklistRecurrence;
  startDate: string;
  opensTime: string;
  cutoffTime: string;
  activeWeekdays: number[];
  responseMode: ChecklistResponseMode;
  itemDrafts: ItemDraft[];
  assigneeIds: string[];
  reviewerIds: string[];
  sectionValidity: readonly [boolean, boolean, boolean, boolean, boolean];
  hasPeople: boolean;
  hideSubmit?: boolean;
  onEditSection: (stepIndex: number) => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  isEditing: boolean;
  isActive?: boolean;
  onSubmit: () => void;
  submitError?: string;
  onReloadLatest?: () => void;
}

const SECTION_CONFIG = [
  { label: 'Basics', icon: FileText },
  { label: 'Schedule', icon: Calendar },
  { label: 'Questions', icon: ListChecks },
  { label: 'Reviewers', icon: ShieldCheck },
  { label: 'Assign', icon: Users },
] as const;

const safeFormatDate = (dateStr: string): string => {
  if (!dateStr) return 'No date set';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 'Invalid date';
    return formatDate(d.toISOString());
  } catch {
    return dateStr;
  }
};

const EditButton = ({
  onClick,
  sectionName,
}: {
  onClick: () => void;
  sectionName: string;
}) => (
  <Button
    variant="outline"
    size="sm"
    onClick={onClick}
    aria-label={`Edit ${sectionName} section`}
    className="gap-1.5 text-primary-700 dark:text-primary-300 border-primary-500/30 hover:border-primary-500/50 hover:bg-primary-500/10"
  >
    <Pencil size={11} className="shrink-0" />
    <span>Edit</span>
  </Button>
);

const SectionCard = ({
  title,
  icon,
  valid,
  onEdit,
  badgeText,
  children,
}: {
  title: string;
  icon: ReactNode;
  valid: boolean;
  onEdit: () => void;
  badgeText?: string;
  children: ReactNode;
}) => (
  <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4 min-w-0', !valid && 'border-warning/40 bg-warning/5')}>
    <div className="flex flex-wrap items-center justify-between gap-2 min-w-0 pb-3 border-b border-border/50">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span
          className={`p-1.5 rounded-lg text-xs ${
            valid
              ? 'bg-muted/60 text-text-secondary'
              : 'bg-warning/15 text-warning'
          }`}
        >
          {icon}
        </span>
        <h3 className="text-xs font-display font-bold text-text-secondary">
          {title}
        </h3>
        {badgeText && (
          <IconChip icon={false} label={badgeText} className="pl-2.5" labelClassName="tabular-nums" />
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!valid && (
          <Badge variant="warning" className="gap-1 t-meta py-0.5 px-2">
            <AlertTriangle size={11} /> Needs attention
          </Badge>
        )}
        <EditButton onClick={onEdit} sectionName={title} />
      </div>
    </div>
    <div className="flex flex-col flex-1 gap-2.5">{children}</div>
  </div>
);

type UserPool = ReturnType<typeof useAssignableUsersQuery>['data'];

const resolveNames = (ids: string[], pool: UserPool) => {
  const names: string[] = [];
  for (const id of ids) {
    const u = pool?.find((a) => a.id === id);
    if (!u) continue;
    const full = `${u.firstName} ${u.lastName ?? ''}`.trim();
    names.push(full || u.email);
  }
  return { names, leftOut: pool ? ids.length - names.length : 0 };
};

const Caption =({ children }: { children: ReactNode }) => (
  <span className="flex items-center gap-1 t-meta font-medium text-text-muted">{children}</span>
);

const NamesSkeleton = () => (
  <div className="flex flex-col gap-1.5" aria-busy="true">
    <Skeleton className="h-3.5 w-3/4 rounded" />
    <Skeleton className="h-3.5 w-1/2 rounded" />
  </div>
);

export const BuilderReviewStep = ({
  name,
  description,
  storeIds,
  recurrence,
  startDate,
  opensTime,
  cutoffTime,
  activeWeekdays,
  responseMode,
  itemDrafts,
  assigneeIds,
  reviewerIds,
  sectionValidity,
  hasPeople,
  hideSubmit = false,
  onEditSection,
  canSubmit,
  isSubmitting,
  isEditing,
  isActive,
  onSubmit,
  submitError,
  onReloadLatest,
}: BuilderReviewStepProps) => {
  const storesQuery = useStoresQuery();
  const assignableQuery = useAssignableUsersQuery(undefined, undefined, storeIds);
  const allActiveQuery = useAssignableUsersQuery();

  const stores = storesQuery.data;
  const assignableUsers = assignableQuery.data;
  const allActiveUsers = allActiveQuery.data;

  const selectedStores = useMemo(
    () => (stores ? storeIds.map((id) => stores.find((s) => s.id === id)?.name ?? 'Unknown store') : []),
    [stores, storeIds],
  );
  const namedItems = useMemo(() => itemDrafts.filter((d) => d.label.trim()), [itemDrafts]);

  const assignees = useMemo(() => resolveNames(assigneeIds, assignableUsers), [assigneeIds, assignableUsers]);
  const reviewers = useMemo(() => resolveNames(reviewerIds, allActiveUsers), [reviewerIds, allActiveUsers]);

  const incompleteSections = sectionValidity
    .map((valid, i) => (valid ? null : { index: i, label: SECTION_CONFIG[i].label }))
    .filter((s): s is { index: number; label: (typeof SECTION_CONFIG)[number]['label'] } => s !== null);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full">
      {isEditing && isActive !== undefined && (
        isActive && !hasPeople ? (
          <NoticeBanner tone="warning" icon={PauseCircle}>
            Nobody is assigned, so saving turns this checklist into a draft. Today&rsquo;s runs nobody started are removed. Started runs stay.
          </NoticeBanner>
        ) : isActive ? (
          <NoticeBanner tone="info" icon={Info}>
            Saving updates today&rsquo;s runs. Runs nobody started are rebuilt. Started runs keep every answer and get your changes. Runs sent for review or approved stay as they are.
          </NoticeBanner>
        ) : hasPeople ? (
          <NoticeBanner tone="success" icon={Info}>
            This checklist is off, and you picked people for it. Saving puts it live and creates today&rsquo;s run for them.
          </NoticeBanner>
        ) : (
          <NoticeBanner tone="neutral" icon={PauseCircle}>
            This checklist is a draft. Nobody is assigned, so nothing runs yet.
          </NoticeBanner>
        )
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard
          title="Basics"
          icon={<FileText size={14} />}
          valid={sectionValidity[0]}
          onEdit={() => onEditSection(0)}
        >
          <div className="flex flex-col gap-1">
            <Caption>Checklist Title</Caption>
            <p className="text-sm font-display font-semibold text-text">
              {name.trim() || <span className="italic text-text-muted">Untitled checklist</span>}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Caption>Description</Caption>
            <p className="text-xs font-display text-text-secondary leading-relaxed line-clamp-3">
              {description.trim() || <span className="italic text-text-muted">No description provided.</span>}
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="Schedule"
          icon={<Calendar size={14} />}
          valid={sectionValidity[1]}
          onEdit={() => onEditSection(1)}
        >
          <div className="grid grid-cols-1 gap-2 text-xs font-display text-text-secondary">
            <div className="flex items-start gap-2">
              <Store size={13} className="text-text-muted shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-text-muted">Stores: </span>
                {storeIds.length === 0 ? (
                  <span className="italic text-warning font-normal">No stores selected</span>
                ) : storesQuery.isPending ? (
                  <Skeleton className="inline-block h-3.5 w-32 align-middle rounded" />
                ) : storesQuery.isError ? (
                  <span className="text-danger">Couldn’t load store names</span>
                ) : (
                  <span className="font-medium text-text">
                    {selectedStores.join(', ')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Repeat size={13} className="text-text-muted shrink-0" />
              <div>
                <span className="text-text-muted">Frequency: </span>
                <span className="font-medium text-text">
                  {RECURRENCE_LABEL[recurrence] ?? recurrence}
                  {recurrence === 'DAILY' && ` · ${formatWeekdays(activeWeekdays)}`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-text-muted shrink-0" />
              <div>
                <span className="text-text-muted">Starts: </span>
                <span className="font-medium text-text">{safeFormatDate(startDate)}</span>
              </div>
            </div>

            {(opensTime || cutoffTime) && (
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-text-muted shrink-0" />
                <div>
                  <span className="text-text-muted">Window: </span>
                  <span className="font-medium text-text">
                    {opensTime || 'Anytime'} &rarr; {cutoffTime || 'End of day'}
                  </span>
                  {isOvernightWindow(opensTime, cutoffTime) && (
                    <span className="text-text-muted"> (cuts off the next day)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Questions"
          icon={<ListChecks size={14} />}
          valid={sectionValidity[2]}
          badgeText={`${namedItems.length} question${namedItems.length === 1 ? '' : 's'}`}
          onEdit={() => onEditSection(2)}
        >
          {namedItems.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-xs font-display text-text-muted italic">
                You haven’t added any questions yet.
              </p>
            </div>
          ) : (
            <ul
              role="list"
              className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1 divide-y divide-border/30"
            >
              {namedItems.map((item, index) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-2 pt-1.5 first:pt-0 text-xs font-display"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="t-meta font-mono font-medium text-text-muted shrink-0 w-5">
                      {String(index + 1).padStart(2, '0')}.
                    </span>
                    <span className="truncate text-text font-medium" title={item.label}>
                      {item.label}
                    </span>
                    {item.section && (
                      <IconChip icon={false} label={item.section} className="shrink-0 pl-2.5" />
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 t-meta py-0 px-1.5">
                    {questionTypeOf(item).label}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Reviewers"
          icon={<ShieldCheck size={14} />}
          valid
          onEdit={() => onEditSection(3)}
        >
          <div className="flex flex-col gap-1">
            <Caption><ShieldCheck size={11} /> Approves or sends back a filled-in run</Caption>
            {reviewerIds.length === 0 ? (
              <p className="text-xs font-display text-text-secondary">
                <span className="italic text-text-muted">
                  No one extra picked. PC/Admin and each assignee's department head can still review.
                </span>
              </p>
            ) : allActiveQuery.isPending ? (
              <NamesSkeleton />
            ) : allActiveQuery.isError ? (
              <InlineError message="We couldn't load the people." onRetry={() => allActiveQuery.refetch()} />
            ) : (
              <>
                <p className="text-xs font-display text-text-secondary">{reviewers.names.join(', ') || <span className="italic text-text-muted">No active reviewers picked</span>}</p>
                {reviewers.leftOut > 0 && (
                  <p className="t-meta font-display text-warning">
                    {reviewers.leftOut} {reviewers.leftOut === 1 ? 'person is' : 'people are'} no longer active and will be left out.
                  </p>
                )}
              </>
            )}
          </div>
        </SectionCard>
        <SectionCard
          title="Assign"
          icon={<Users size={14} />}
          valid
          onEdit={() => onEditSection(4)}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Caption><UserCheck size={11} /> Assigned to</Caption>
              {assignableQuery.isPending ? (
                <NamesSkeleton />
              ) : assignableQuery.isError ? (
                <InlineError message="We couldn't load the people." onRetry={() => assignableQuery.refetch()} />
              ) : (
                <>
                  <p className="text-xs font-display text-text-secondary">
                    {assignees.names.length ? (
                      assignees.names.join(', ')
                    ) : (
                      <span className="font-medium text-warning">Nobody yet. It is saved as a draft and goes live when you add people.</span>
                    )}
                  </p>
                  {assignees.leftOut > 0 && (
                    <p className="t-meta font-display text-warning">
                      {assignees.leftOut} {assignees.leftOut === 1 ? 'person is' : 'people are'} not in the selected stores and will be left out.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Caption><Layers size={11} /> Who fills it</Caption>
              <p className="text-xs font-display font-medium text-text">{RESPONSE_MODE_TITLE[responseMode]}</p>
            </div>
          </div>
        </SectionCard>

      </div>

      {submitError && <InlineError message={submitError} />}
      {submitError && onReloadLatest && (
        <Button variant="outline" size="sm" className="self-start" onClick={onReloadLatest}>
          Load the latest version
        </Button>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border/60">
        {!canSubmit && incompleteSections.length > 0 ? (
          <NoticeBanner tone="warning" icon={AlertTriangle} className="sm:flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Complete the missing fields in:</span>
              {incompleteSections.map((s) => (
                <Button
                  key={s.index}
                  variant="outline"
                  size="sm"
                  onClick={() => onEditSection(s.index)}
                  className="text-warning border-warning/30 hover:border-warning/50 hover:bg-warning/10"
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </NoticeBanner>
        ) : (
          hasPeople ? (
            <p className="flex items-center gap-1.5 text-xs font-display text-success">
              <CheckCircle2 size={14} className="shrink-0" /> Everything looks good to go.
            </p>
          ) : (
            <NoticeBanner tone="warning" icon={PauseCircle} className="sm:flex-1">
              Nobody is assigned yet, so it is saved as a draft. Come back, add the people, and it goes live by itself.
            </NoticeBanner>
          )
        )}

        {!hideSubmit && (
          <Button
            variant="primary"
            onClick={onSubmit}
            isLoading={isSubmitting}
            disabled={!canSubmit}
            className="w-full sm:w-auto sm:shrink-0 pointer-coarse:h-11"
          >
            {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : hasPeople ? 'Create Checklist' : 'Save as draft'}
          </Button>
        )}
      </div>
    </div>
  );
};
