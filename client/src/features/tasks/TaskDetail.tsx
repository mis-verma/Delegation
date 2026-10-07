import { useState, type ReactNode } from 'react';
import { CheckSquare, Loader2, ChevronRight, MoreHorizontal, Undo2, PauseCircle, CircleDot, Clock, Eye, CheckCircle2, ShieldCheck, Trash2, CalendarDays, Check, Milestone } from 'lucide-react';
import { Modal, Button, DateRangePicker, ActivityFeed, FullChangeLog, DepartmentChip, useConfirm } from '../../components';
import { IconChip } from '../../components/iconChip';
import type { DateRangeValue } from '../../components';
import { useTaskQuery, useUpdateTaskMutation, useDeleteTaskMutation, useAssignableUsersQuery } from './hook';
import { useDepartmentsQuery } from '../tickets/hook';
import { TaskVerifyActions } from './TaskVerifyActions';
import { TaskFormDepartmentField } from './TaskFormDepartmentField';
import { AssigneeField } from '../assignees/AssigneeField';
import { TaskDescriptionField } from './TaskDescriptionField';
import { VerificationNoteBanner } from '../../components/verificationBanner';
import { STATUS_LABEL, NEXT_STATUS, endOfDay } from './taskDisplay';
import { TaskScoreBadge } from './TaskScoreBadge';
import { TaskStatusCard } from './TaskStatusCard';
import { FORWARD_LABEL, BACK_STATUS, BACK_LABEL, CAN_HOLD } from './taskStatusModel';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { TaskPriorityChipPicker } from './TaskPriorityChipPicker';
import { DETAIL_HEADING_CLASS, CHIP_TRIGGER_CLASS } from './taskFormFieldStyles';
import { TaskStatusRemarkDialog } from './TaskStatusRemarkDialog';
import { DetailLabelsField } from '../tags/DetailLabelsField';
import { taskAssigneeIds } from './cardFields';
import { useAuth } from '../../context/AuthContext';
import type { Task, UpdateTaskPayload } from '../../api/task';


const TitleEditor = ({ value, disabled, onSave, isViewMode }: { value: string, disabled: boolean, onSave: (val: string) => void, isViewMode: boolean }) => {
  const [title, setTitle] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  
  if (value !== prevValue) {
    setPrevValue(value);
    setTitle(value);
  }

  if (isViewMode) {
    return <h2 className="text-lg md:text-xl font-semibold text-text leading-snug break-words select-text">{value}</h2>;
  }

  // A textarea that grows with its content (field-sizing), not a one-line Input — on a phone a
  // longer title was cut off at the input's edge. Enter still saves rather than adding a newline.
  return (
    <textarea
      value={title}
      rows={1}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => onSave(title)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      disabled={disabled}
      placeholder="Delegation title"
      aria-label="Delegation title"
      className="block text-lg md:text-xl font-semibold leading-snug w-full px-3 py-1 -ml-3 rounded-md border-0 bg-transparent text-text resize-none [field-sizing:content] outline-none transition-all focus:bg-surface-hover/50 focus:ring-2 focus:ring-primary-500/30 disabled:opacity-70"
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

  // Read-only: plain text, not a disabled textarea — the empty box with a resize handle read as a
  // broken form field in view mode. (TaskDetail puts the attach buttons on the heading row then.)
  if (disabled) {
    return (
      <div className="flex flex-col gap-3">
        {/* Plain body text under the small label above, no box: the same title-and-subtitle
            reading as the ticket sheet. */}
        {value.trim() ? (
          <p className="text-base text-text leading-relaxed whitespace-pre-wrap break-words select-text">{value}</p>
        ) : (
          <p className="text-base text-text-light italic">No description added.</p>
        )}
        {children}
      </div>
    );
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
  isPC: boolean;
  isVerifier: boolean;
  nextStatus: Task['status'] | null;
  /** Opens the remark dialog — the status change itself can't be fired without one. */
  onAdvance: () => void;
  /** Opens the same remark dialog for the one step back (null when there is none). */
  onBack: (() => void) | null;
  /** Opens the same remark dialog to pause it (null when it can't be paused from here). */
  onHold: (() => void) | null;
  isAdvancing: boolean;
  onClose: () => void;
}

const TaskFooter = ({ task, isPC, isVerifier, nextStatus, onAdvance, onBack, onHold, isAdvancing, onClose }: TaskFooterProps) => {
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
          <TaskVerifyActions task={task} onDecided={onClose} />
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-4">
        {/* The score now has its own panel under the status at the top of the sheet, so the footer
            only keeps the Completed / Awaiting approval notes. */}
        <div className="hidden sm:flex items-center gap-3 flex-wrap">
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
        {/* Phones: Advance fills the row as the filled primary action — moving the delegation
            forward is what this sheet is usually opened for, and it opens the remark popup. The ✕
            in the header closes the sheet there. Desktop keeps Advance / Done. No Edit button:
            fields are editable directly for anyone allowed to edit. */}
        <div className="flex items-center gap-2 sm:flex-wrap">
          {nextStatus && !isPC && (
            <Button
              variant="outline"
              size="sm"
              // The sheet's one forward action, so it's the solid navy button on every screen
              // (was navy on phones only, a pale outline on desktop).
              className="max-sm:flex-1 max-sm:min-w-0 bg-primary-800 text-white border-transparent hover:bg-primary-900 hover:text-white dark:bg-primary-600 dark:hover:bg-primary-500 font-display"
              disabled={isAdvancing}
              onClick={onAdvance}
            >
              {isAdvancing ? <Loader2 size={14} className="animate-spin mr-1 shrink-0" /> : <ChevronRight size={14} className="mr-1 shrink-0" />}
              <span className="truncate">{FORWARD_LABEL[task.status] ?? `Move to ${STATUS_LABEL[nextStatus as keyof typeof STATUS_LABEL]}`}</span>
            </Button>
          )}
          {(onBack || onHold) && !isPC && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="px-2.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label="More status actions">
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 rounded-xl">
                {onHold && (
                  <DropdownMenuItem onClick={onHold} className="gap-2.5 py-2 cursor-pointer">
                    <PauseCircle size={15} className="text-warning" />
                    <span className="font-medium text-sm">Put on hold</span>
                  </DropdownMenuItem>
                )}
                {onBack && (
                  <DropdownMenuItem onClick={onBack} className="gap-2.5 py-2 cursor-pointer">
                    <Undo2 size={15} className="text-primary-600" />
                    <span className="font-medium text-sm">{BACK_LABEL[task.status]}</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            // Phones: only when there's nothing else in the row — otherwise the header ✕ closes.
            className={`px-6 ${nextStatus && !isPC ? 'max-sm:hidden' : 'max-sm:flex-1'}`}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

const STATUS_ORDER: Task['status'][] = ['todo', 'in_progress', 'pending_approval', 'done'];

// A plain colored "value" pill (matching PRIORITY_MAP's existing badge tint) instead of the
// always-visible three-button grid TaskFormPrioritySelector renders elsewhere — click it to
// change priority via a small menu, same as picking any other value rather than filling in a form.

const TIMELINE_STEP_DESCRIPTION: Record<Task['status'], string> = {
  draft: 'Delegation drafted, not yet published.',
  todo: 'Delegation created and assigned.',
  in_progress: 'Work is underway.',
  pending_approval: 'Submitted for review.',
  done: 'Delegation completed and closed.',
  on_hold: 'Work is paused.',
};

const STEP_ICON: Record<Task['status'], typeof Check> = {
  draft: CircleDot,
  todo: CircleDot,
  in_progress: Clock,
  pending_approval: Eye,
  done: CheckCircle2,
  on_hold: PauseCircle,
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
const TaskStatusStepper = ({ task, nameOf }: { task: Task; nameOf: (id: string | null | undefined) => string | undefined }) => {
  const currentIndex = STATUS_ORDER.indexOf(task.status);
  const isDraft = task.status === 'draft';

  // statusUpdates is newest-first, so `find` is the MOST RECENT arrival at a stage — the right one
  // for a delegation that looped (sent for verification, rejected, sent again): what describes the
  // stage now is the latest move into it, not the first.
  const arrivalAt = (status: Task['status']) =>
    (task.statusUpdates ?? []).find((u) => u.toStatus === status) ?? null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className={DETAIL_HEADING_CLASS}>
        <Milestone size={14} className="text-text-light" />
        Progress
      </h3>
      {isDraft && (
        <p className="text-xs font-display text-text-muted rounded-lg border border-border/60 bg-surface-hover/40 px-3 py-2">
          This is a draft, not published yet. Move it to To do to start the steps below.
        </p>
      )}

      {/* Done steps: solid green circle + check on a green rail. Current: solid navy circle with
          the stage's own icon and a soft ring, its content in a tinted card marked "Current".
          Upcoming: muted outline circle with the stage icon. Opacity tints throughout; the old
          current circle used a raw bg-primary-50, which glowed near-white in dark mode. */}
      <ol className="flex flex-col">
        {STATUS_ORDER.map((s, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isLast = i === STATUS_ORDER.length - 1;
          const reached = i <= currentIndex;
          const StepIcon = STEP_ICON[s];

          const arrival = reached ? arrivalAt(s) : null;
          // 'todo' is where every delegation starts, so it has no status-change entry of its own.
          // "Done" is reached by the reviewer approving it, not by a status move, so it has no entry of its
          // own: its time, person and note come from the approval itself.
          const approval = s === 'done' && task.status === 'done' && task.verifiedAt ? task : null;
          const stamp = arrival ? new Date(arrival.createdAt)
            : approval ? new Date(approval.verifiedAt as string)
            : reached && s === 'todo' ? new Date(task.createdAt)
            : null;
          const author = arrival?.changedByUser?.firstName ?? (approval ? nameOf(approval.verifiedBy) : undefined);
          const remark = arrival?.remark || (approval ? approval.verificationNote : null);

          return (
            <li key={s} className="flex gap-3" aria-current={isCurrent ? 'step' : undefined}>
              <div className="flex flex-col items-center">
                <span
                  className={`flex items-center justify-center size-7 rounded-full shrink-0 transition-colors duration-200 ${
                    isDone
                      ? 'bg-success text-white'
                      : isCurrent
                        ? 'bg-primary-700 text-white ring-4 ring-primary-500/15'
                        : 'border-2 border-border bg-surface text-text-light'
                  }`}
                >
                  {isDone ? <Check size={13} strokeWidth={3} /> : <StepIcon size={13} strokeWidth={2.5} />}
                </span>
                {!isLast && (
                  <span className={`w-0.5 flex-1 min-h-5 my-1 rounded-full ${isDone ? 'bg-primary-500/60' : 'bg-primary-500/20'}`} />
                )}
              </div>

              <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-4'}`}>
                <div
                  className={`flex flex-col gap-1.5 ${
                    isCurrent
                      ? 'rounded-xl border border-primary-500/20 dark:border-primary-400/20 bg-primary-500/5 dark:bg-primary-500/10 px-3 py-2.5 -mt-1'
                      : 'pt-1'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-display font-semibold tracking-tight leading-tight ${reached ? 'text-text' : 'text-text-light'}`}>
                      {STATUS_LABEL[s]}
                    </p>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-primary-700 text-white text-xs font-bold leading-none">Current</span>
                    )}
                  </div>

                  {stamp && (
                    <p className="text-xs font-medium text-text-muted tabular-nums leading-tight">
                      {author ? `${author} · ` : ''}{formatStepDate(stamp)}, {formatStepTime(stamp)}
                    </p>
                  )}

                  {remark ? (
                    <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words pl-2.5 border-l-2 border-primary-500/30">
                      {remark}
                    </p>
                  ) : (
                    <p className={`text-xs leading-snug ${reached ? 'text-text-muted' : 'text-text-light'}`}>{TIMELINE_STEP_DESCRIPTION[s]}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};



const formatRangeDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

interface TaskEditLayoutProps {
  task: Task;
  isVerifier: boolean;
  isViewOnly: boolean;
  canReassign: boolean;
  assignableUsers: ReturnType<typeof useAssignableUsersQuery>['data'];
  isLoadingUsers: boolean;
  departments: ReturnType<typeof useDepartmentsQuery>['data'];
  isLoadingDepts: boolean;
  onSaveTitle: (title: string) => void;
  onSaveDescription: (description: string) => void;
  onUpdate: (payload: UpdateTaskPayload) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

const TaskEditLayout = ({
  task, isVerifier, isViewOnly, canReassign,
  assignableUsers, isLoadingUsers, departments, isLoadingDepts,
  onSaveTitle, onSaveDescription, onUpdate, onDelete, isDeleting,
}: TaskEditLayoutProps) => {
  const departmentName = task.departmentId ? departments?.find((d) => d.id === task.departmentId)?.name : undefined;
  // Names for the ids the task carries (who raised it, who approved it) from the people list this
  // role can already see; an id that is not in it simply shows no name.
  const nameOf = (id: string | null | undefined) => {
    const person = id ? assignableUsers?.find((u) => u.id === id) : undefined;
    return person ? `${person.firstName}${person.lastName ? ` ${person.lastName}` : ''}` : undefined;
  };
  const raisedBy = nameOf(task.userId);
  return (
  // flex-col + flex-1 on the scroller, not `h-full`: on phones the percentage height didn't resolve
  // against this flex item, so the scroller grew to its full content height and the sheet's
  // overflow-hidden clipped it — Progress/Activity below the description couldn't be reached.
  <div className="relative flex-1 min-h-0 flex flex-col">
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar flex flex-col gap-4 sm:gap-5 p-4 sm:p-6 max-w-2xl mx-auto w-full">
      {/* Title with its own label, like Description and Progress below it. The delete button
          sits on the label row now, so the title itself gets the sheet's full width to wrap in. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3 min-h-8">
          <span className="text-xs font-display font-medium text-text-muted">Title</span>
          {isVerifier && (
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => onDelete(task.id)}
              aria-label="Delete delegation"
              title="Delete delegation"
              className="flex items-center justify-center size-8 rounded-full text-text-light hover:text-danger hover:bg-danger/10 active:bg-danger/10 disabled:opacity-50 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40 [-webkit-tap-highlight-color:transparent]"
            >
              {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          )}
        </div>
        <TitleEditor value={task.title} isViewMode disabled onSave={onSaveTitle} />
        <p className="text-xs font-display font-medium text-text-muted">
          {raisedBy ? `Raised by ${raisedBy} \u00b7 ` : ''}Created {formatStepDate(new Date(task.createdAt))}, {formatStepTime(new Date(task.createdAt))}
        </p>
      </div>

      <TaskStatusCard task={task} nameOf={nameOf} />
      <TaskScoreBadge status={task.status} variant="panel" />

      <VerificationNoteBanner note={task.verificationNote} approved={task.status === 'done'} verifiedBy={task.verifiedBy} />

      {/* Assigned to · Priority · Timeline · Department as one wrapping row of chips, the same
          chip language the list cards use — they used to be four labelled rows. Each chip is its
          own control for anyone who can edit (tap it to change that one value); read-only roles
          get plain chips. The field name is on each chip's title/aria-label instead of a label. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div title="Assigned to" aria-label="Assigned to" className="flex items-center">
            <AssigneeField
              hideLabel
              selectedIds={taskAssigneeIds(task)}
              onChange={(ids) => onUpdate({ assigneeId: ids[0] ?? null, additionalAssigneeIds: ids.slice(1) })}
              users={assignableUsers}
              isLoading={isLoadingUsers}
              disabled={isViewOnly || !canReassign}
            />
          </div>

          <span title="Priority" className="flex">
            <TaskPriorityChipPicker value={task.priority} onChange={(v) => onUpdate({ priority: v })} disabled={isViewOnly} />
          </span>

          {isViewOnly ? (
            (task.startDate || task.dueDate) && (
              <IconChip
                icon={CalendarDays}
                tone="bg-primary-700"
                title="Timeline"
                label={[task.startDate && formatRangeDate(task.startDate), task.dueDate && formatRangeDate(task.dueDate)].filter(Boolean).join(' → ')}
              />
            )
          ) : (
            <div title="Timeline">
              <DateRangePicker
                value={{
                  from: task.startDate ? new Date(task.startDate) : null,
                  to: task.dueDate ? new Date(task.dueDate) : null,
                }}
                onChange={(range: DateRangeValue) => onUpdate({
                  startDate: range.from ? range.from.toISOString() : undefined,
                  dueDate: range.to ? endOfDay(range.to).toISOString() : undefined,
                })}
                placeholder="Add dates"
                triggerClassName={CHIP_TRIGGER_CLASS}
              />
            </div>
          )}

          {isViewOnly || !canReassign ? (
            departmentName && (
              <span title="Department" className="flex">
                <DepartmentChip name={departmentName} />
              </span>
            )
          ) : (
            <div title="Department">
              <TaskFormDepartmentField
                hideLabel
                value={task.departmentId ?? ''}
                onChange={(v) => onUpdate({ departmentId: v || null })}
                departments={departments}
                isLoading={isLoadingDepts}
                triggerClassName={`${CHIP_TRIGGER_CLASS} max-w-[13rem]`}
              />
            </div>
          )}
        </div>

        {!isViewOnly && !canReassign && (
          <p className="text-xs font-medium text-text-light">Only a manager or above can reassign or move departments.</p>
        )}

        {/* No reviewer picker: PC and Admin already verify every delegation by default
            (task.service.ts's CAN_VERIFY_BY_ROLE), same as Ticket — naming one was a manual step
            that changed nothing. Older delegations that already named reviewers still show them,
            read-only. */}
        {(task.reviewers?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <ShieldCheck size={14} className="text-text-light shrink-0" />
            <span>Reviewers: {task.reviewers!.map((r) => `${r.firstName}${r.lastName ? ` ${r.lastName}` : ''}`).join(', ')}</span>
          </div>
        )}
      </div>

      <DetailLabelsField
        current={task.tags ?? []}
        onSave={(tagIds) => onUpdate({ tagIds })}
        canCreate={isVerifier}
        readOnly
        headingClassName={DETAIL_HEADING_CLASS}
      />

      <hr className="border-border/60" />

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-display font-medium text-text-muted">Description</h3>
        {/* No attachments grid here any more (removed by request, same call as the comment feed
            below) — files can still be attached when a delegation is first created (TaskForm's
            own AttachFilesToolbar), that flow is untouched. This sheet's own upload button had
            already been hidden with nothing left to trigger it; this finishes that and drops the
            now-inert view/delete grid too, rather than leaving it half-removed. */}
        <PlainDescriptionEditor
          value={task.description ?? ''}
          disabled
          onSave={onSaveDescription}
        />
      </div>

      <hr className="border-border/60" />

      {/* The old Activity feed (a comment box + comment/status history, visible to anyone) used to
          sit below this. It's gone by request: the only place to write anything about a delegation
          is now the dialog that opens from "Advance to …", which won't move the status without a
          remark. The stepper is what answers "where is this now" at a glance for everyone.
          ActivityTimeline below is a different, unrelated thing added later: an ADMIN/PC-only
          read-only audit trail (who changed which fields, sourced from AuditLog) — not a
          reintroduction of the removed comment feed, and invisible to every other role. */}
      {/* The step list is for larger screens; on a phone the status card and the score panel above
          already say where it stands. */}
      <div className="max-sm:hidden">
        <TaskStatusStepper task={task} nameOf={nameOf} />
      </div>

      {/* Everyone who works on the delegation sees the plain history (the server decides who); Admin and
          PC also get the field-by-field change log, folded away underneath. */}
      <hr className="border-border/60" />
      <ActivityFeed entityType="Task" entityId={task.id} />
      <FullChangeLog entityType="Task" entityId={task.id} />
    </div>

    <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-card to-transparent" />
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card to-transparent" />
  </div>
  );
};

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
  /** Accepted for existing callers; there's no separate edit mode any more (see TaskDetail). */
  initialMode?: 'view' | 'edit';
}

export const TaskDetail = ({ task: initialTask, onClose }: TaskDetailProps) => {
  const { data: fresh } = useTaskQuery(initialTask.id);
  const task = fresh ?? initialTask;
  const { user } = useAuth();

  // The status the footer's "Advance" button is proposing. Held here rather than fired straight
  // at the API because the server requires a remark with every status change.
  const [advanceTo, setAdvanceTo] = useState<Task['status'] | null>(null);

  const isPC = user?.role === 'PC';
  const isRestrictedUser = user?.role === 'USER';
  // No separate Edit mode: anyone allowed to edit gets editable fields as soon as the sheet opens
  // (they auto-save per field), instead of a read-only view behind an extra "Edit" tap. Roles that
  // can't edit still get the read-only chips.
  const isViewOnly = isPC || isRestrictedUser || user?.role === 'APPROVAL_MANAGER';
  const isVerifier = isPC || user?.role === 'ADMIN';
  const canReassign = user?.role !== 'AGENT' && user?.role !== 'USER';
  const nextStatus = NEXT_STATUS[task.status as keyof typeof NEXT_STATUS];

  const updateMutation = useUpdateTaskMutation({ silent: true });
  const deleteMutation = useDeleteTaskMutation();
  const confirm = useConfirm();
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
      description={
        <span className="hidden sm:inline">
          {isViewOnly ? 'Review this delegation’s details.' : 'Changes save automatically as you edit each field.'}
        </span>
      }
      onClose={onClose}
      size="xl"
      icon={<CheckSquare className="w-5 h-5 text-primary-600" />}
      title="Delegation details"
      // Desktop-only: on a phone this line cost header height and said nothing the title doesn't.
      
      bodyClassName="p-0 overflow-hidden rounded-b-xl"
      footer={
        <TaskFooter
          task={task}
          isPC={isPC}
          isVerifier={isVerifier}
          nextStatus={nextStatus}
          onAdvance={() => nextStatus && setAdvanceTo(nextStatus)}
          onHold={CAN_HOLD.includes(task.status) ? () => setAdvanceTo('on_hold') : null}
          onBack={BACK_STATUS[task.status] ? () => setAdvanceTo(BACK_STATUS[task.status] as Task['status']) : null}
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
          assignableUsers={assignableUsers}
          isLoadingUsers={isLoadingUsers}
          departments={departments}
          isLoadingDepts={isLoadingDepts}
          onSaveTitle={saveTitle}
          onSaveDescription={saveDescription}
          onUpdate={handleUpdate}
          onDelete={async (id: string) => {
            const ok = await confirm({
              title: 'Delete this delegation?',
              description: 'It is removed from the lists.',
              confirmLabel: 'Delete',
              variant: 'danger',
            });
            if (ok) deleteMutation.mutate(id, { onSuccess: onClose });
          }}
          isDeleting={deleteMutation.isPending}
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
              { id: task.id, payload: { status: advanceTo, statusRemark: statusRemark || undefined } },
              { onSuccess: () => setAdvanceTo(null) },
            );
          }}
        />
      )}
    </Modal>
  );
};