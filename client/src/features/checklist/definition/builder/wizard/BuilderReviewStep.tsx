import type { ReactNode } from 'react';
import {
  Pencil,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Store,
  Repeat,
  Calendar,
  Clock,
  Users,
  FileText,
  ListChecks,
  UserCheck,
  ShieldCheck,
} from 'lucide-react';
import { Button, formatWeekdays } from '../../../../../components';
import { Badge } from '@/components/ui/badge';
import { useStoresQuery } from '../../../hook';
import { useAssignableUsersQuery } from '../../../../tickets/hook';
import { RECURRENCE_LABEL, formatDate } from '../../../checklistDisplay';
import { isOvernightWindow } from '../BuilderSchedulePanel';
import { ROLE_OPTIONS } from '../../form/ChecklistRolesField';
import type { ItemDraft } from '../../ChecklistDefinitionItemDraftRow';
import { questionTypeOf } from '../questionTypes';
import type {
  ChecklistRecurrence,
  ChecklistAssigneeRole,
} from '../../../../../api/checklistDefinitions';

interface BuilderReviewStepProps {
  name: string;
  description: string;
  storeIds: string[];
  recurrence: ChecklistRecurrence;
  startDate: string;
  opensTime: string;
  cutoffTime: string;
  activeWeekdays: number[];
  itemDrafts: ItemDraft[];
  assigneeIds: string[];
  assigneeRoles: ChecklistAssigneeRole[];
  reviewerIds: string[];
  sectionValidity: readonly [boolean, boolean, boolean, boolean];
  onEditSection: (stepIndex: number) => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  isEditing: boolean;
  onSubmit: () => void;
  submitError?: string;
}

const SECTION_CONFIG = [
  { label: 'Basics', icon: FileText },
  { label: 'Schedule', icon: Calendar },
  { label: 'Items', icon: ListChecks },
  { label: 'Assign', icon: Users },
] as const;

/** Safe date formatter to prevent invalid date runtime crashes */
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
  <button
    type="button"
    onClick={onClick}
    aria-label={`Edit ${sectionName} section`}
    // No dark: variant on any of these used to mean this button (repeated once per Review
    // section) kept its light-mode colors — pale bg, dark-navy-on-white border — in dark theme
    // too, instead of the rest of the app's opacity-tinted "adapts to either theme" convention.
    className="inline-flex items-center gap-1.5 text-xs font-display font-medium px-2.5 py-1 rounded-md text-primary-700 dark:text-primary-300 bg-primary-500/10 dark:bg-primary-500/15 hover:bg-primary-500/15 dark:hover:bg-primary-500/20 hover:text-primary-800 dark:hover:text-primary-200 border border-primary-200/60 dark:border-primary-800/40 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
  >
    <Pencil size={11} className="shrink-0" />
    <span>Edit</span>
  </button>
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
  <div
    className={`flex flex-col rounded-2xl border bg-surface p-4 transition-colors ${
      valid
        ? 'border-border/80 hover:border-border'
        : 'border-warning/40 bg-warning/5 ring-1 ring-warning/20'
    }`}
  >
    <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-border/50">
      <div className="flex items-center gap-2">
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
          <span className="text-[11px] font-medium text-text-muted px-1.5 py-0.5 rounded-full bg-muted/50">
            {badgeText}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!valid && (
          <Badge variant="warning" className="gap-1 text-[11px] py-0.5 px-2">
            <AlertTriangle size={11} /> Needs attention
          </Badge>
        )}
        <EditButton onClick={onEdit} sectionName={title} />
      </div>
    </div>
    <div className="flex flex-col flex-1 gap-2.5">{children}</div>
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
  itemDrafts,
  assigneeIds,
  assigneeRoles,
  reviewerIds,
  sectionValidity,
  onEditSection,
  canSubmit,
  isSubmitting,
  isEditing,
  onSubmit,
  submitError,
}: BuilderReviewStepProps) => {
  const { data: stores = [] } = useStoresQuery();
  // Every selected store, not just the first — a checklist can span multiple stores, and an
  // assignee added via a later store's "select everyone" bulk-add otherwise resolved to nothing
  // here and rendered as "Unknown user" even though they're a perfectly valid assignee.
  const { data: assignableUsers = [] } = useAssignableUsersQuery(
    undefined,
    undefined,
    storeIds
  );
  // Reviewers aren't necessarily store-scoped (a checklist can be reviewed by someone outside its
  // own stores, e.g. a corporate/compliance reviewer), so their names can't be resolved off the
  // store-scoped assignableUsers list above — an ADMIN/PC caller with no scope args at all gets
  // every active user back (see user.service.ts's listAssignable), which is what this needs.
  const { data: allActiveUsers = [] } = useAssignableUsersQuery();

  const selectedStores = storeIds
    .map((id) => stores.find((s) => s.id === id)?.name ?? 'Unknown store');
  const namedItems = itemDrafts.filter((d) => d.label.trim());
  const resolveName = (id: string, pool: typeof assignableUsers) => {
    const u = pool.find((a) => a.id === id);
    if (!u) return 'Unknown user';
    const full = `${u.firstName} ${u.lastName ?? ''}`.trim();
    return full || u.email;
  };
  const assignees = assigneeIds.map((id) => resolveName(id, assignableUsers));
  const reviewers = reviewerIds.map((id) => resolveName(id, allActiveUsers));

  const incompleteSections = sectionValidity
    .map((valid, i) => (valid ? null : { index: i, label: SECTION_CONFIG[i].label }))
    .filter((s): s is { index: number; label: (typeof SECTION_CONFIG)[number]['label'] } => s !== null);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full max-w-5xl mx-auto">
      {/* Grid of Sections — the step frame above already carries the "Review & Create" heading. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Basics */}
        <SectionCard
          title="Basics"
          icon={<FileText size={14} />}
          valid={sectionValidity[0]}
          onEdit={() => onEditSection(0)}
        >
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-text-muted">
              Checklist Title
            </span>
            <p className="text-sm font-display font-semibold text-text">
              {name.trim() || <span className="italic text-text-muted">Untitled checklist</span>}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-text-muted">
              Description
            </span>
            <p className="text-xs font-display text-text-secondary leading-relaxed line-clamp-3">
              {description.trim() || <span className="italic text-text-muted">No description provided.</span>}
            </p>
          </div>
        </SectionCard>

        {/* 2. Schedule */}
        <SectionCard
          title="Schedule"
          icon={<Calendar size={14} />}
          valid={sectionValidity[1]}
          onEdit={() => onEditSection(1)}
        >
          <div className="grid grid-cols-1 gap-2 text-xs font-display text-text-secondary">
            {/* Stores */}
            <div className="flex items-start gap-2">
              <Store size={13} className="text-text-muted shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-text-muted">Stores: </span>
                {selectedStores.length > 0 ? (
                  <span className="font-medium text-text">
                    {selectedStores.join(', ')}
                  </span>
                ) : (
                  <span className="italic text-warning font-normal">No stores selected</span>
                )}
              </div>
            </div>

            {/* Recurrence */}
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

            {/* Start Date */}
            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-text-muted shrink-0" />
              <div>
                <span className="text-text-muted">Starts: </span>
                <span className="font-medium text-text">{safeFormatDate(startDate)}</span>
              </div>
            </div>

            {/* Active Time Window */}
            {(opensTime || cutoffTime) && (
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-text-muted shrink-0" />
                <div>
                  <span className="text-text-muted">Window: </span>
                  <span className="font-medium text-text">
                    {opensTime || 'Anytime'} &rarr; {cutoffTime || 'End of day'}
                  </span>
                  {/* Cutoff earlier than open time rolls the deadline to the next calendar day
                      (checklistDisplay.ts's instanceDeadline) — called out here so publishing
                      this schedule doesn't silently land a day later than it visually reads. */}
                  {isOvernightWindow(opensTime, cutoffTime) && (
                    <span className="text-text-muted"> (cuts off the next day)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        {/* 3. Items */}
        <SectionCard
          title="Items"
          icon={<ListChecks size={14} />}
          valid={sectionValidity[2]}
          badgeText={`${namedItems.length} item${namedItems.length === 1 ? '' : 's'}`}
          onEdit={() => onEditSection(2)}
        >
          {namedItems.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-xs font-display text-text-muted italic">
                You haven't added any items yet.
              </p>
            </div>
          ) : (
            <ul
              role="list"
              className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1 divide-y divide-border/30"
            >
              {namedItems.map((item, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between gap-2 pt-1.5 first:pt-0 text-xs font-display"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[11px] font-mono font-medium text-text-muted shrink-0 w-5">
                      {String(index + 1).padStart(2, '0')}.
                    </span>
                    <span className="truncate text-text font-medium" title={item.label}>
                      {item.label}
                    </span>
                    {item.section && (
                      <span className="shrink-0 text-[10px] font-display text-text-muted px-1.5 py-0.5 rounded-full bg-muted/50">
                        {item.section}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px] py-0 px-1.5">
                    {questionTypeOf(item).label}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 4. Assign */}
        <SectionCard
          title="Assign"
          icon={<Users size={14} />}
          valid={sectionValidity[3]}
          onEdit={() => onEditSection(3)}
        >
          <div className="flex flex-col gap-3">
            {/* Roles */}
            {assigneeRoles.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-text-muted">
                  Assigned Roles
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {assigneeRoles.map((role) => (
                    <Badge key={role} variant="info" className="text-[11px] py-0.5">
                      {ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Specific Assignees */}
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-text-muted flex items-center gap-1">
                <UserCheck size={11} /> Specific Assignees
              </span>
              <p className="text-xs font-display text-text-secondary">
                {assignees.length ? (
                  assignees.join(', ')
                ) : (
                  <span className="italic text-text-muted">No individual users selected</span>
                )}
              </p>
            </div>
          </div>
        </SectionCard>

        {/* 5. Reviewers — its own card now that it's its own step; always "valid" (no minimum
            required, see BuilderReviewersPanel) so this never shows the warning treatment. */}
        <SectionCard
          title="Reviewers"
          icon={<ShieldCheck size={14} />}
          valid
          onEdit={() => onEditSection(4)}
        >
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-text-muted flex items-center gap-1">
              <ShieldCheck size={11} /> Approves or sends back a filled-in run
            </span>
            <p className="text-xs font-display text-text-secondary">
              {reviewers.length ? (
                reviewers.join(', ')
              ) : (
                <span className="italic text-text-muted">
                  No one extra picked — PC/Admin and each assignee's department head can still review.
                </span>
              )}
            </p>
          </div>
        </SectionCard>
      </div>

      {/* Submission Error Banner */}
      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-display"
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">{submitError}</div>
        </div>
      )}

      {/* Action Footer & Incomplete Step Helper */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border/60">
        <div>
          {!canSubmit && incompleteSections.length > 0 ? (
            <div className="flex items-center gap-2 text-xs font-display text-warning">
              <AlertTriangle size={14} className="shrink-0" />
              <span>
                Please complete missing fields in:{' '}
                {incompleteSections.map((s, idx) => (
                  <button
                    key={s.index}
                    type="button"
                    onClick={() => onEditSection(s.index)}
                    className="font-semibold underline hover:text-warning-hover cursor-pointer"
                  >
                    {s.label}
                    {idx < incompleteSections.length - 1 ? ', ' : ''}
                  </button>
                ))}
              </span>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs font-display text-success">
              <CheckCircle2 size={14} className="shrink-0" /> Everything looks good to go.
            </p>
          )}
        </div>

        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          className="gap-2 rounded-lg px-5 py-2 font-display font-medium shadow-xs"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Saving...</span>
            </>
          ) : isEditing ? (
            'Save changes'
          ) : (
            'Create checklist'
          )}
        </Button>
      </div>
    </div>
  );
};