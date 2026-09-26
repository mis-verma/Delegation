import { useState, type ReactNode } from 'react';
import { CheckSquare, Loader2, ChevronRight, CheckCircle2, ShieldCheck, Trash2, SquarePen, Users, CalendarDays, Flag, Building2, Check, Milestone, AlignLeft } from 'lucide-react';
import { Modal, Button, DateRangePicker, Input, ActivityTimeline, DepartmentChip } from '../../components';
import { IconChip } from '../../components/iconChip';
import type { DateRangeValue } from '../../components';
import { Badge } from '../../components/ui/badge';
import { useTaskQuery, useUpdateTaskMutation, useDeleteTaskMutation, useAssignableUsersQuery, useUploadTaskAttachmentsMutation } from './hook';
import { useDepartmentsQuery } from '../tickets/hook';
import { TaskVerifyActions } from './TaskVerifyActions';
import { TaskFormDepartmentField } from './TaskFormDepartmentField';
import { AssigneeField } from '../assignees/AssigneeField';
import { AttachFilesToolbar } from './AttachFilesToolbar';
import { TaskAttachmentsGrid } from './TaskAttachmentsGrid';
import { TaskDescriptionField } from './TaskDescriptionField';
import { VerificationNoteBanner } from '../../components/verificationBanner';
import { STATUS_LABEL, STATUS_CONFIG, STATUS_ICON, PRIORITY_MAP, NEXT_STATUS } from './taskDisplay';
import { PRIORITY_SELECTED_CLASS } from './TaskFormPrioritySelector';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { TaskScoreBadge } from './TaskScoreBadge';
import { TaskStatusRemarkDialog } from './TaskStatusRemarkDialog';
import { taskAssigneeIds } from './cardFields';
import { ReviewersField } from '../reviewers/ReviewersField';
import { useAuth } from '../../context/AuthContext';
import { SECTION_LABEL_CLASS, SECTION_TITLE_CLASS } from './taskFormFieldStyles';
import type { Task, UpdateTaskPayload } from '../../api/task';


const TitleEditor = ({ value, disabled, onSave, isViewMode }: { value: string, disabled: boolean, onSave: (val: string) => void, isViewMode: boolean }) => {
  const [title, setTitle] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  
  if (value !== prevValue) {
    setPrevValue(value);
    setTitle(value);
  }

  if (isViewMode) {
    return <h2 className="text-lg md:text-xl font-semibold text-text px-3 py-2 -ml-3">{value}</h2>;
  }

  return (
    <Input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => onSave(title)}
      disabled={disabled}
      placeholder="Delegation title"
      className="text-lg md:text-xl font-semibold w-full h-auto px-3 py-2 -ml-3 rounded-md border-0 bg-transparent text-text outline-none transition-all focus:ring-2 focus:ring-primary-500/30 disabled:opacity-70"
    />
  );
};

interface DescriptionEditorProps {
  value: string;
  disabled: boolean;
  onSave: (val: string) => void;
  toolbar?: ReactNode;
  children?: ReactNode;
}

// Used to be its own bare, borderless textarea (no box, no focus ring, toolbar floating with no
// separating line) — a second, hand-duplicated description editor next to TaskForm's own bordered
// TaskDescriptionField, so the same field looked and felt like two different products depending on
// whether you were creating or editing a delegation. This keeps the local-state/auto-save-on-blur
// behavior (unchanged) but renders through the one shared TaskDescriptionField component instead,
// so the bordered card, focus ring, and toolbar/attachments sub-row styling live in exactly one
// place and both forms get it for free. No `label` passed here — this section already has its own
// heading above it (see the "Description" <h3> at its call site) rather than TaskForm's inline
// per-field label, which is what TaskDescriptionField's own `label` prop was built for.
const PlainDescriptionEditor = ({ value, disabled, onSave, toolbar, children }: DescriptionEditorProps) => {
  const [desc, setDesc] = useState(value);
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    setDesc(value);
  }

  return (
    <TaskDescriptionField
      value={desc}
      onChange={setDesc}
      onBlur={() => onSave(desc)}
      disabled={disabled}
      rows={4}
      placeholder="Add more detail…"
      toolbar={toolbar}
    >
      {children}
    </TaskDescriptionField>
  );
};


interface TaskFooterProps {
  task: Task;
  mode: 'view' | 'edit';
  isPC: boolean;
  isVerifier: boolean;
  nextStatus: Task['status'] | null;
  onEdit: () => void;
  /** Opens the remark dialog — the status change itself can't be fired without one. */
  onAdvance: () => void;
  isAdvancing: boolean;
  onClose: () => void;
}

const TaskFooter = ({ task, mode, isPC, isVerifier, nextStatus, onEdit, onAdvance, isAdvancing, onClose }: TaskFooterProps) => {
  // Single-stage verify: one PC/ADMIN/manager/reviewer check decides the whole thing (see
  // task.service.ts's CAN_VERIFY_BY_ROLE) — the old two-stage QC-then-approval split is gone.
  const needsDecision = isVerifier && task.status === 'pending_approval';
  return (
    <div className="flex flex-col w-full">
      {/* The actual decision a verifier opened this for — its own full-width band, separated from
          the housekeeping row below (Edit/Done), instead of two small buttons buried mid-scroll
          under a progress bar where they read as just another form control. Matches the weight
          TicketDetail already gives the same decision (TicketVerificationActions). */}
      {needsDecision && (
        <div className="pb-4 mb-4 border-b border-border/60">
          <TaskVerifyActions task={task} />
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-4">
        {/* Score/status readout is desktop-only here — phones show the score beside the status chip
            at the top of the sheet (TaskStatusSummary) instead of spending a footer row on it. */}
        <div className="hidden sm:flex items-center gap-3 flex-wrap">
          <TaskScoreBadge status={task.status} />
          {task.status === 'done' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-success px-2 py-1 rounded-md">
              <CheckCircle2 size={15} /> Completed
            </span>
          )}
          {task.status === 'pending_approval' && !needsDecision && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-status-approve bg-status-approve/10 px-2 py-1 rounded-md">
              <ShieldCheck size={15} /> Awaiting approval
            </span>
          )}
        </div>
        {/* Phones: one row — Edit (compact) + Advance filling the rest as the filled primary action,
            since moving the delegation forward is what this sheet is usually opened for. It used to
            be an outline button that read as disabled, stacked over a separate Done row; the ✕ in
            the header closes the sheet there. Desktop keeps Edit / Advance / Done as before. */}
        <div className="flex items-center gap-2 sm:flex-wrap">
          {mode === 'view' && !isPC && (
            <Button variant="outline" size="sm" onClick={onEdit} className="shrink-0 text-text-secondary hover:text-text border-border">
              <SquarePen size={14} className="sm:mr-1" />
              <span className="sm:hidden">Edit</span>
              <span className="hidden sm:inline">Edit Delegation</span>
            </Button>
          )}
          {nextStatus && !isPC && (
            <Button
              variant="outline"
              size="sm"
              className="max-sm:flex-1 max-sm:min-w-0 max-sm:bg-primary-700 max-sm:text-white max-sm:border-transparent max-sm:hover:bg-primary-800 sm:border-primary-200 sm:text-primary-700 sm:hover:bg-primary-50"
              disabled={isAdvancing}
              onClick={onAdvance}
            >
              {isAdvancing ? <Loader2 size={14} className="animate-spin mr-1 shrink-0" /> : <ChevronRight size={14} className="mr-1 shrink-0" />}
              <span className="truncate">Advance to {STATUS_LABEL[nextStatus as keyof typeof STATUS_LABEL]}</span>
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={onClose}
            // Phones: only when there's nothing else in the row — otherwise the header ✕ closes.
            className={`px-6 ${nextStatus && !isPC ? 'max-sm:hidden' : 'max-sm:flex-1'}`}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};

const STATUS_ORDER: Task['status'][] = ['todo', 'in_progress', 'pending_approval', 'done'];

// A single status readout — icon, label, and "step 2 of 4" — using the same semantic
// STATUS_CONFIG tone every other status pill in the app already wears, through the shared Badge
// component (outline variant, fully re-tinted via className since STATUS_CONFIG's own
// status-todo/progress/approve/done tokens don't map onto Badge's built-in success/warning/danger
// variants), instead of a bespoke 4-segment bar with a label crammed under each sliver. The full
// arrival-by-arrival history (with remarks) already lives in TaskStatusStepper further down — this
// is only the at-a-glance answer to "where is this right now."
const TaskStatusSummary = ({ status }: { status: Task['status'] }) => {
  const config = STATUS_CONFIG[status];
  const stepIndex = STATUS_ORDER.indexOf(status);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Badge variant="outline" className={`pl-2 pr-3 py-1 text-xs ${config.badge}`}>
          {STATUS_ICON[status]}
          {STATUS_LABEL[status]}
        </Badge>
        {/* Phones: the score sits beside the status here instead of taking a footer row of its own. */}
        <span className="sm:hidden">
          <TaskScoreBadge status={status} />
        </span>
      </div>
      {stepIndex >= 0 && (
        <span className="text-[11px] font-semibold text-text-light tabular-nums shrink-0">
          Step {stepIndex + 1} of {STATUS_ORDER.length}
        </span>
      )}
    </div>
  );
};

const PRIORITY_ORDER: Task['priority'][] = ['low', 'medium', 'high'];

// A plain colored "value" pill (matching PRIORITY_MAP's existing badge tint) instead of the
// always-visible three-button grid TaskFormPrioritySelector renders elsewhere — click it to
// change priority via a small menu, same as picking any other value rather than filling in a form.
const PriorityValuePicker = ({ value, onChange, disabled }: { value: Task['priority']; onChange: (v: Task['priority']) => void; disabled: boolean }) => {
  const current = PRIORITY_MAP[value];
  // No border — matches the flat tag-pill style TaskFormPrioritySelector uses for the same value
  // everywhere else, a soft tint fill is the whole signal.
  // w-fit + self-start: in the phone property grid a stretched cell turned this into a full-width
  // red bar. Now a chip sized to its label, with the same color dot the priority menu uses.
  const outlineChipClass = `inline-flex items-center gap-1.5 w-fit self-start px-2.5 py-1 rounded-full text-xs font-semibold ${PRIORITY_SELECTED_CLASS[value]}`;
  const dot = <span aria-hidden="true" className={`size-1.5 rounded-full shrink-0 ${current.accent}`} />;

  if (disabled) {
    return (
      <span className={outlineChipClass}>
        {dot}
        {current.label}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${outlineChipClass} transition-opacity hover:opacity-80 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40`}
        >
          {dot}
          {current.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {PRIORITY_ORDER.map((p) => (
          <DropdownMenuItem key={p} onClick={() => onChange(p)} className="gap-2">
            <span className={`size-2 rounded-full ${PRIORITY_MAP[p].accent}`} />
            {PRIORITY_MAP[p].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const TIMELINE_STEP_DESCRIPTION: Record<Task['status'], string> = {
  draft: 'Delegation drafted, not yet published.',
  todo: 'Delegation created and assigned.',
  in_progress: 'Work is underway.',
  pending_approval: 'Submitted for review.',
  done: 'Delegation completed and closed.',
};

const formatStepDate = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const formatStepTime = (date: Date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });


/**
 * Where the delegation sits in the four-stage pipeline — and, for every stage it has actually
 * reached, the remark somebody wrote when they moved it there.
 *
 * The remark is the point of the row, so it takes the readable body size and the stage's generic
 * blurb ("Work is underway.") steps aside whenever there's a real one to show. Without this the
 * remarks were write-only: required on every status change, stored, returned by the API, and
 * rendered nowhere.
 *
 * Step timestamps used to come from `task.updatedAt`, which changes on ANY edit — retitling,
 * reassigning, attaching a file — so the date against the current stage was frequently not when
 * the delegation reached that stage at all. Each step is now stamped from the entry that produced
 * it, and date and remark always describe the same event.
 */
const TaskStatusStepper = ({ task }: { task: Task }) => {
  const currentIndex = STATUS_ORDER.indexOf(task.status);

  // statusUpdates is newest-first, so `find` is the MOST RECENT arrival at a stage — the right one
  // for a delegation that looped (sent for verification, rejected, sent again): what describes the
  // stage now is the latest move into it, not the first.
  const arrivalAt = (status: Task['status']) =>
    (task.statusUpdates ?? []).find((u) => u.toStatus === status) ?? null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_LABEL_CLASS}>
        <Milestone size={13} className="text-text-light" />
        Progress
      </h3>

      <div className="flex flex-col">
        {STATUS_ORDER.map((s, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isLast = i === STATUS_ORDER.length - 1;
          const reached = i <= currentIndex;

          const arrival = reached ? arrivalAt(s) : null;
          // 'todo' is where every delegation starts, so it has no status-change entry of its own.
          const stamp = arrival ? new Date(arrival.createdAt)
            : reached && s === 'todo' ? new Date(task.createdAt)
            : null;
          const author = arrival?.changedByUser?.firstName;

          return (
            <div key={s} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex items-center justify-center size-6 rounded-full shrink-0 transition-colors duration-200 ${
                    isDone
                      ? 'bg-primary-500/20 text-primary-700'
                      : isCurrent
                        ? 'border-2 border-primary-500 bg-primary-50'
                        : 'border-2 border-border bg-surface'
                  }`}
                >
                  {isDone && <Check size={12} strokeWidth={3} />}
                  {isCurrent && <span className="size-2 rounded-full bg-primary-500" />}
                </span>
                {!isLast && <span className={`w-px flex-1 min-h-5 ${isDone ? 'bg-primary-500/20' : 'bg-border'}`} />}
              </div>

              <div className={`flex-1 min-w-0 flex flex-col gap-1.5 ${isLast ? '' : 'pb-5'}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm font-bold tracking-tight leading-tight ${reached ? 'text-text' : 'text-text-light'}`}>
                    {STATUS_LABEL[s]}
                  </p>
                  {stamp && (
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-semibold text-text-secondary tabular-nums leading-tight">{formatStepDate(stamp)}</p>
                      <p className="text-[11px] font-medium text-text-light tabular-nums leading-tight">{formatStepTime(stamp)}</p>
                    </div>
                  )}
                </div>

                {arrival?.remark ? (
                  // Quoted with a rule rather than boxed in a filled card — it sits inside a
                  // timeline that already has a rail, and a second filled block per stage would
                  // make the column read as a stack of cards instead of one continuous track.
                  <div className="flex flex-col gap-1 pl-2.5 border-l-2 border-primary-500/25">
                    <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                      {arrival.remark}
                    </p>
                    {author && (
                      <p className="text-[11px] font-semibold text-text-light tracking-tight">— {author}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs font-medium text-text-muted leading-snug">{TIMELINE_STEP_DESCRIPTION[s]}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const PROPERTY_ROW_LABEL_CLASS = 'flex items-center gap-1.5 sm:gap-2 w-full sm:w-28 shrink-0 text-xs sm:text-sm font-medium text-text-muted sm:text-text-secondary';

// Label above value on phones (a cell in a 2-column grid), label beside value from `sm` up.
const PROPERTY_ROW_CLASS = 'flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0';

const formatRangeDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

interface TaskEditLayoutProps {
  task: Task;
  isVerifier: boolean;
  isViewOnly: boolean;
  canReassign: boolean;
  canManageAttachments: boolean;
  assignableUsers: ReturnType<typeof useAssignableUsersQuery>['data'];
  isLoadingUsers: boolean;
  departments: ReturnType<typeof useDepartmentsQuery>['data'];
  isLoadingDepts: boolean;
  onSaveTitle: (title: string) => void;
  onSaveDescription: (description: string) => void;
  onUpdate: (payload: UpdateTaskPayload) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  uploadMutation: ReturnType<typeof useUploadTaskAttachmentsMutation>;
}

const TaskEditLayout = ({
  task, isVerifier, isViewOnly, canReassign, canManageAttachments,
  assignableUsers, isLoadingUsers, departments, isLoadingDepts,
  onSaveTitle, onSaveDescription, onUpdate, onDelete, isDeleting, uploadMutation,
}: TaskEditLayoutProps) => {
  const { user } = useAuth();
  return (
  <div className="relative flex-1 min-h-0">
    <div className="h-full overflow-y-auto no-scrollbar flex flex-col gap-4 sm:gap-5 p-4 sm:p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <TitleEditor value={task.title} isViewMode={isViewOnly} disabled={isViewOnly} onSave={onSaveTitle} />
        </div>
        {isVerifier && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-danger border-danger/30 hover:bg-danger/10"
            disabled={isDeleting}
            onClick={() => onDelete(task.id)}
            aria-label="Delete delegation"
            title="Delete delegation"
          >
            {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </Button>
        )}
      </div>

      <TaskStatusSummary status={task.status} />

      <VerificationNoteBanner note={task.verificationNote} approved={task.status === 'done'} verifiedBy={task.verifiedBy} />

      {/* Phones: one 2-column grid (label above value) — Assigned to + Priority share a row,
          Timeline takes the full width, then Department. It used to be a full-width row per field,
          which ran the four properties down most of the screen. Read-only values render as the
          same chips the list cards use, instead of disabled controls that looked faded/broken.
          From `sm` up it's the original label-beside-value list. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:flex sm:flex-col sm:gap-3">
        <div className={PROPERTY_ROW_CLASS}>
          <span className={PROPERTY_ROW_LABEL_CLASS}>
            <Users size={14} className="text-text-light" /> Assigned to
          </span>
          <div className="flex-1 min-w-0">
            <AssigneeField
              hideLabel
              selectedIds={taskAssigneeIds(task)}
              onChange={(ids) => onUpdate({ assigneeId: ids[0] ?? null, additionalAssigneeIds: ids.slice(1) })}
              users={assignableUsers}
              isLoading={isLoadingUsers}
              disabled={isViewOnly || !canReassign}
            />
            {!isViewOnly && !canReassign && (
              <p className="text-[11px] font-medium text-text-light mt-1">Only a manager or above can reassign.</p>
            )}
          </div>
        </div>

        <div className={`${PROPERTY_ROW_CLASS} sm:order-2`}>
          <span className={PROPERTY_ROW_LABEL_CLASS}>
            <Flag size={14} className="text-text-light" /> Priority
          </span>
          <PriorityValuePicker value={task.priority} onChange={(v) => onUpdate({ priority: v })} disabled={isViewOnly} />
        </div>

        <div className={`${PROPERTY_ROW_CLASS} col-span-2 sm:order-1`}>
          <span className={PROPERTY_ROW_LABEL_CLASS}>
            <CalendarDays size={14} className="text-text-light" /> Timeline
          </span>
          {isViewOnly ? (
            task.startDate || task.dueDate ? (
              <IconChip
                icon={CalendarDays}
                tone="bg-primary-700"
                label={[task.startDate && formatRangeDate(task.startDate), task.dueDate && formatRangeDate(task.dueDate)].filter(Boolean).join(' → ')}
                className="w-fit self-start"
              />
            ) : (
              <span className="text-sm text-text-light">No dates set</span>
            )
          ) : (
            <DateRangePicker
              value={{
                from: task.startDate ? new Date(task.startDate) : null,
                to: task.dueDate ? new Date(task.dueDate) : null,
              }}
              onChange={(range: DateRangeValue) => onUpdate({
                startDate: range.from ? range.from.toISOString() : undefined,
                dueDate: range.to ? range.to.toISOString() : undefined,
              })}
              triggerClassName="w-auto h-auto p-0 border-0 shadow-none bg-transparent justify-start text-sm focus:ring-0"
            />
          )}
        </div>

        <div className={`${PROPERTY_ROW_CLASS} col-span-2 sm:order-3`}>
          <span className={PROPERTY_ROW_LABEL_CLASS}>
            <Building2 size={14} className="text-text-light" /> Department
          </span>
          <div className="flex-1 min-w-0">
            {isViewOnly || !canReassign ? (
              task.departmentId && departments?.find((d) => d.id === task.departmentId) ? (
                <DepartmentChip name={departments.find((d) => d.id === task.departmentId)!.name} className="w-fit" />
              ) : (
                <span className="text-sm text-text-light">No department</span>
              )
            ) : (
              <TaskFormDepartmentField
                hideLabel
                value={task.departmentId ?? ''}
                onChange={(v) => onUpdate({ departmentId: v || null })}
                departments={departments}
                isLoading={isLoadingDepts}
                triggerClassName="w-auto h-auto p-0 border-0 shadow-none bg-transparent justify-start text-sm focus:ring-0"
              />
            )}
            {!isViewOnly && !canReassign && (
              <p className="text-[11px] font-medium text-text-light mt-1">Only a manager or above can move departments.</p>
            )}
          </div>
        </div>

        {/* Reviewer assignment is the same "routing authority" decision as reassigning who owns
            this delegation — gated behind canReassign for the same reason. Someone without that
            authority still sees who's named, just not an editable picker. */}
        {!isViewOnly && canReassign ? (
          <div className="col-span-2 sm:order-4">
            <ReviewersField
              departmentId={task.departmentId ?? undefined}
              selected={(task.reviewers ?? []).map((r) => r.id)}
              onChange={(ids) => onUpdate({ reviewerIds: ids })}
            />
          </div>
        ) : (task.reviewers?.length ?? 0) > 0 && (
          <div className={`${PROPERTY_ROW_CLASS} col-span-2 sm:order-4`}>
            <span className={PROPERTY_ROW_LABEL_CLASS}>
              <ShieldCheck size={14} className="text-text-light" /> Reviewers
            </span>
            <span className="text-sm text-text-secondary">
              {task.reviewers!.map((r) => `${r.firstName}${r.lastName ? ` ${r.lastName}` : ''}`).join(', ')}
            </span>
          </div>
        )}
      </div>

      <hr className="border-border/60" />

      <div className="flex flex-col gap-2">
        <h3 className={SECTION_TITLE_CLASS}>
          <AlignLeft size={14} />
          Description
        </h3>
        <PlainDescriptionEditor
          value={task.description ?? ''}
          disabled={isViewOnly}
          onSave={onSaveDescription}
          toolbar={
            canManageAttachments && (
              <AttachFilesToolbar
                disabled={uploadMutation.isPending}
                onFiles={(files) => uploadMutation.mutate(Array.from(files))}
              />
            )
          }
        >
          {/* TaskDescriptionField already wraps children in its own bordered, padded sub-row (see
              TaskForm's identical StagedFileChips usage) — the old mt-4 pt-4 here was compensating
              for PlainDescriptionEditor rendering children with no wrapper at all; keeping it now
              would double up the spacing on top of that shared wrapper's own padding. */}
          {(uploadMutation.isPending || uploadMutation.isError || (task.attachments?.length ?? 0) > 0) && (
            <div className="flex flex-col gap-3">
              {uploadMutation.isPending && (
                <p className="flex items-center gap-2 text-sm font-medium text-text-muted">
                  <Loader2 size={16} className="animate-spin text-primary-500" /> Uploading files…
                </p>
              )}
              {uploadMutation.isError && (
                <p className="text-sm font-medium text-danger bg-danger/10 p-3 rounded-lg border border-danger/20">
                  {uploadMutation.error instanceof Error ? uploadMutation.error.message : 'Failed to upload files.'}
                </p>
              )}
              <TaskAttachmentsGrid taskId={task.id} attachments={task.attachments ?? []} canManage={canManageAttachments} />
            </div>
          )}
        </PlainDescriptionEditor>
      </div>

      <hr className="border-border/60" />

      {/* The old Activity feed (a comment box + comment/status history, visible to anyone) used to
          sit below this. It's gone by request: the only place to write anything about a delegation
          is now the dialog that opens from "Advance to …", which won't move the status without a
          remark. The stepper is what answers "where is this now" at a glance for everyone.
          ActivityTimeline below is a different, unrelated thing added later: an ADMIN/PC-only
          read-only audit trail (who changed which fields, sourced from AuditLog) — not a
          reintroduction of the removed comment feed, and invisible to every other role. */}
      <TaskStatusStepper task={task} />

      {(user?.role === 'ADMIN' || user?.role === 'PC') && (
        <>
          <hr className="border-border/60" />
          <ActivityTimeline entityType="Task" entityId={task.id} />
        </>
      )}
    </div>

    <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-card to-transparent" />
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card to-transparent" />
  </div>
  );
};

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
  initialMode?: 'view' | 'edit';
}

export const TaskDetail = ({ task: initialTask, onClose, initialMode = 'view' }: TaskDetailProps) => {
  const { data: fresh } = useTaskQuery(initialTask.id);
  const task = fresh ?? initialTask;
  const { user } = useAuth();

  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  // The status the footer's "Advance" button is proposing. Held here rather than fired straight
  // at the API because the server requires a remark with every status change.
  const [advanceTo, setAdvanceTo] = useState<Task['status'] | null>(null);

  const isPC = user?.role === 'PC';
  const isRestrictedUser = user?.role === 'USER';
  const isViewOnly = mode === 'view' || isPC || isRestrictedUser || user?.role === 'APPROVAL_MANAGER';
  const isVerifier = isPC || user?.role === 'ADMIN';
  const canReassign = user?.role !== 'AGENT' && user?.role !== 'USER';
  const canManageAttachments = isVerifier || task.userId === user?.id || taskAssigneeIds(task).includes(user?.id ?? '');
  const nextStatus = NEXT_STATUS[task.status as keyof typeof NEXT_STATUS];

  const updateMutation = useUpdateTaskMutation({ silent: true });
  const deleteMutation = useDeleteTaskMutation();
  const uploadAttachmentsMutation = useUploadTaskAttachmentsMutation(task.id);
  const { data: assignableUsers, isLoading: isLoadingUsers } = useAssignableUsersQuery();
  const { data: departments, isLoading: isLoadingDepts } = useDepartmentsQuery();

  const handleUpdate = (payload: UpdateTaskPayload) => {
    updateMutation.mutate({ id: task.id, payload });
  };

  const saveTitle = (newTitle: string) => {
    const trimmed = newTitle.trim();
    if (trimmed && trimmed !== task.title) {
      handleUpdate({ title: trimmed });
    }
  };

  const saveDescription = (newDesc: string) => {
    if (newDesc !== (task.description ?? '')) {
      handleUpdate({ description: newDesc });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={<CheckSquare className="w-5 h-5 text-primary-600" />}
      title={mode === 'edit' ? 'Edit delegation' : 'Delegation details'}
      // Desktop-only: on a phone this line cost header height and said nothing the title doesn't.
      description={
        <span className="hidden sm:inline">
          {mode === 'edit' ? 'Changes save automatically as you edit each field.' : 'Review this delegation’s details.'}
        </span>
      }
      bodyClassName="p-0 overflow-hidden rounded-b-xl"
      footer={
        <TaskFooter
          task={task}
          mode={mode}
          isPC={isPC}
          isVerifier={isVerifier}
          nextStatus={nextStatus}
          onEdit={() => setMode('edit')}
          onAdvance={() => nextStatus && setAdvanceTo(nextStatus)}
          isAdvancing={updateMutation.isPending}
          onClose={onClose}
        />
      }
    >
      {/* dvh, not vh, below md: on mobile `vh` measures the viewport with the browser's URL bar
          hidden, so 75vh + header + footer overflowed the visible area and pushed the footer —
          Edit, "Advance to…", Close — off the bottom of the screen. dvh tracks what's actually
          visible. Desktop keeps the original 75vh panel. */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 h-[70dvh] md:h-[75vh]">
        <TaskEditLayout
          task={task}
          isVerifier={isVerifier}
          isViewOnly={isViewOnly}
          canReassign={canReassign}
          canManageAttachments={canManageAttachments}
          assignableUsers={assignableUsers}
          isLoadingUsers={isLoadingUsers}
          departments={departments}
          isLoadingDepts={isLoadingDepts}
          onSaveTitle={saveTitle}
          onSaveDescription={saveDescription}
          onUpdate={handleUpdate}
          onDelete={(id: string) => deleteMutation.mutate(id, { onSuccess: onClose })}
          isDeleting={deleteMutation.isPending}
          uploadMutation={uploadAttachmentsMutation}
        />
      </div>

      {/* Every status change goes through here, on both this modal's Advance button and a board
          drag — the server rejects a move with no remark, and the two entry points share this one
          dialog so they can't ask for different things. */}
      {advanceTo && (
        <TaskStatusRemarkDialog
          nested
          task={task}
          toStatus={advanceTo}
          isSubmitting={updateMutation.isPending}
          onCancel={() => setAdvanceTo(null)}
          onConfirm={(statusRemark) => {
            updateMutation.mutate(
              { id: task.id, payload: { status: advanceTo, statusRemark } },
              { onSuccess: () => setAdvanceTo(null) },
            );
          }}
        />
      )}
    </Modal>
  );
};