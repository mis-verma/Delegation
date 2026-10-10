import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CheckSquare, Loader2, ChevronRight, MoreHorizontal, Undo2, PauseCircle, CircleDot, Clock, Eye, CheckCircle2, ShieldCheck, ShieldX, Trash2, CalendarDays, Check, Milestone, RotateCcw, Info } from 'lucide-react';
import { Modal, Button, DateRangePicker, ActivityFeed, FullChangeLog, DepartmentChip, ImageLightbox, NoticeBanner, useConfirm } from '../../components';
import { IconChip } from '../../components/iconChip';
import type { DateRangeValue } from '../../components';
import { useTaskQuery, useUpdateTaskMutation, useDeleteTaskMutation, useAssignableUsersQuery } from './hook';
import { useDepartmentsQuery } from '../tickets/hook';
import { TaskVerifyActions } from './TaskVerifyActions';
import { TaskFormDepartmentField } from './TaskFormDepartmentField';
import { AssigneeField } from '../assignees/AssigneeField';
import { TaskDescriptionField } from './TaskDescriptionField';
import { TaskChecklistPanel } from './TaskChecklistPanel';
import { STATUS_LABEL, NEXT_STATUS, endOfDay } from './taskDisplay';
import { TaskStatusCard } from './TaskStatusCard';
import { FORWARD_LABEL, BACK_STATUS, BACK_LABEL, CAN_HOLD, PUBLISH_REMARK, draftPublishProblem } from './taskStatusModel';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { TaskPriorityChipPicker } from './TaskPriorityChipPicker';
import { DETAIL_HEADING_CLASS, CHIP_TRIGGER_CLASS } from './taskFormFieldStyles';
import { TaskStatusRemarkDialog } from './TaskStatusRemarkDialog';
import { TaskAttachments } from './TaskAttachments';
import { DetailLabelsField } from '../tags/DetailLabelsField';
import { taskAssigneeIds } from './cardFields';
import { useAuth } from '../../context/AuthContext';
import type { Task, UpdateTaskPayload } from '../../api/task';
import type { AssignableUser } from '../../api/users';
import { canApproveWork } from '../../lib/canApproveWork';
import { canEditTaskContent, canMoveTask, viewOnlyReason } from './taskPermissions';

type SaveState = 'idle' | 'saving' | 'error';

/** Grows a textarea to fit its text on every change. `field-sizing: content` would do this in CSS,
 *  but iOS Safari doesn't support it, so the height is set by hand. */
const useAutoGrow = (value: string) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
};

/** "Not saved. Retry" under a field whose auto-save failed. The typed text stays in the field. */
const NotSaved = ({ onRetry }: { onRetry: () => void }) => (
  <p role="alert" className="flex items-center gap-2 t-meta font-display font-medium text-danger">
    Not saved.
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center h-8 pointer-coarse:h-11 px-2 -my-1 pointer-coarse:-my-2.5 rounded-md font-semibold underline-offset-2 hover:underline cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
    >
      Retry
    </button>
  </p>
);

/**
 * Local text plus its save state, shared by the title and description editors. The local text only
 * follows the saved value while nothing is in flight or failed: a failed save rolls the cache back,
 * and re-syncing then would wipe what the person typed.
 */
const useAutoSavedText = (value: string, save: (next: string) => Promise<unknown>) => {
  const [text, setText] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const [state, setState] = useState<SaveState>('idle');

  if (value !== prevValue) {
    setPrevValue(value);
    if (state === 'idle') setText(value);
  }

  const commit = (next: string) => {
    setState('saving');
    save(next).then(
      () => {
        // What was saved may be the trimmed text; adopt it unless the person has typed on since.
        setText((cur) => (cur.trim() === next.trim() ? next : cur));
        setState('idle');
      },
      () => setState('error'),
    );
  };

  return { text, setText, state, commit, dirty: state === 'error' || (state === 'idle' && text !== value) };
};

interface EditorProps {
  value: string;
  onSave: (val: string) => Promise<unknown>;
  onDirtyChange: (dirty: boolean) => void;
}

const TitleEditor = ({ value, onSave, onDirtyChange, isViewMode }: EditorProps & { isViewMode: boolean }) => {
  const { text, setText, state, commit, dirty } = useAutoSavedText(value, onSave);
  const [emptyError, setEmptyError] = useState(false);
  const ref = useAutoGrow(text);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  if (isViewMode) {
    return <h2 className="t-title font-display font-semibold text-text leading-snug break-words select-text">{value}</h2>;
  }

  const handleBlur = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      // A delegation always has a title: put the old one back and say why.
      setText(value);
      setEmptyError(true);
      return;
    }
    setEmptyError(false);
    if (trimmed !== value || state === 'error') commit(trimmed);
    else if (text !== value) setText(value);
  };

  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <textarea
        ref={ref}
        value={text}
        rows={1}
        onChange={(e) => { setText(e.target.value); if (emptyError) setEmptyError(false); }}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        placeholder="Delegation title"
        aria-label="Delegation title"
        aria-invalid={emptyError || state === 'error'}
        className="block t-title font-display font-semibold leading-snug w-full px-3 py-1 -ml-3 rounded-md border-0 bg-transparent text-text resize-none overflow-hidden outline-none transition-colors duration-150 ease-out focus:bg-surface-hover/50 focus:ring-2 focus:ring-primary-500/30"
      />
      {emptyError && <p role="alert" className="t-meta font-display font-medium text-danger">Title can't be empty</p>}
      {state === 'error' && <NotSaved onRetry={() => commit(text.trim())} />}
    </div>
  );
};

const PlainDescriptionEditor = ({ value, disabled, onSave, onDirtyChange, children }: EditorProps & { disabled: boolean; children?: ReactNode }) => {
  const { text, setText, state, commit, dirty } = useAutoSavedText(value, onSave);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  if (disabled) {
    return (
      <div className="flex flex-col gap-3">
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
    <div className="flex flex-col gap-1.5">
      <TaskDescriptionField
        value={text}
        onChange={setText}
        onBlur={() => { if (text !== value || state === 'error') commit(text); }}
        rows={4}
        placeholder="Add more detail…"
      >
        {children}
      </TaskDescriptionField>
      {state === 'error' && <NotSaved onRetry={() => commit(text)} />}
    </div>
  );
};


interface TaskFooterProps {
  task: Task;
  /** May move this delegation's status (see taskPermissions' canMoveTask). */
  canMove: boolean;
  /** May approve or send back this delegation (see lib/canApproveWork). */
  canApprove: boolean;
  nextStatus: Task['status'] | null;
  onAdvance: () => void;
  onBack: (() => void) | null;
  onHold: (() => void) | null;
  /** Admin only, on an approved delegation. */
  onReopen: (() => void) | null;
  isAdvancing: boolean;
  onClose: () => void;
}

const TaskFooter = ({ task, canMove, canApprove, nextStatus, onAdvance, onBack, onHold, onReopen, isAdvancing, onClose }: TaskFooterProps) => {
  const needsDecision = canApprove && task.status === 'pending_approval';
  const showAdvance = !!nextStatus && canMove;
  const hasMenu = canMove && (onBack || onHold || onReopen);
  return (
    <div className="flex flex-col gap-4 w-full">
      {needsDecision && (
        <div className="pb-4 border-b border-border/60">
          <TaskVerifyActions task={task} onDecided={onClose} nested />
        </div>
      )}
      <div className="flex items-center justify-between w-full gap-3">
        <div className="hidden sm:flex items-center gap-3 flex-wrap">
          {task.status === 'done' && (
            <span className="flex items-center gap-1.5 t-meta font-semibold text-success">
              <CheckCircle2 size={15} /> Approved
            </span>
          )}
          {task.status === 'pending_approval' && !needsDecision && (
            <span className="flex items-center gap-1.5 t-meta font-semibold text-status-approve">
              <ShieldCheck size={15} /> {STATUS_LABEL.pending_approval}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 max-sm:flex-1 sm:flex-wrap">
          {showAdvance && (
            <Button
              variant="primary"
              size="sm"
              className="max-sm:flex-1 max-sm:min-w-0 font-display"
              disabled={isAdvancing}
              onClick={onAdvance}
            >
              {isAdvancing ? <Loader2 size={14} className="animate-spin shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
              <span className="truncate">{FORWARD_LABEL[task.status] ?? `Move to ${STATUS_LABEL[nextStatus as keyof typeof STATUS_LABEL]}`}</span>
            </Button>
          )}
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="px-2.5 pointer-coarse:min-w-11" aria-label="More status actions">
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
                    <Undo2 size={15} />
                    <span className="font-medium text-sm">{BACK_LABEL[task.status]}</span>
                  </DropdownMenuItem>
                )}
                {onReopen && (
                  <DropdownMenuItem onClick={onReopen} className="gap-2.5 py-2 cursor-pointer">
                    <RotateCcw size={15} />
                    <span className="font-medium text-sm">{BACK_LABEL.done}</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* Desktop closes from the header X. A phone with nothing else down here keeps a full-width Close. */}
          {!showAdvance && (
            <Button variant="outline" size="sm" onClick={onClose} className="sm:hidden flex-1">
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const STATUS_ORDER: Task['status'][] = ['todo', 'in_progress', 'pending_approval', 'done'];

const TIMELINE_STEP_DESCRIPTION: Record<Task['status'], string> = {
  draft: 'Delegation drafted, not yet published.',
  todo: 'Delegation created and assigned.',
  in_progress: 'Work is underway.',
  pending_approval: 'Marked completed, waiting for a reviewer.',
  done: 'Approved and closed.',
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

/** One row of the stepper. `current` gets a neutral border and bold text, nothing louder. */
const StepRow = ({
  label, icon: StepIcon, done, current, reached, isLast, stamp, author, note,
}: {
  label: string;
  icon: typeof Check;
  done: boolean;
  current: boolean;
  reached: boolean;
  isLast: boolean;
  stamp: Date | null;
  author?: string;
  note: string;
}) => (
  <li className="flex gap-3" aria-current={current ? 'step' : undefined}>
    <div className="flex flex-col items-center">
      <span
        className={`flex items-center justify-center size-7 rounded-full shrink-0 transition-colors duration-200 ${
          done
            ? 'bg-success text-white'
            : current
              ? 'border-2 border-text-secondary bg-surface text-text'
              : 'border-2 border-border bg-surface text-text-light'
        }`}
      >
        {done ? <Check size={13} strokeWidth={3} /> : <StepIcon size={13} strokeWidth={2.5} />}
      </span>
      {!isLast && <span className={`w-0.5 flex-1 min-h-5 my-1 rounded-full ${done ? 'bg-success/50' : 'bg-border'}`} />}
    </div>

    <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-4'}`}>
      <div className={`flex flex-col gap-1.5 ${current ? 'rounded-xl border border-border-hover px-3 py-2.5 -mt-1' : 'pt-1'}`}>
        <p className={`t-card font-display tracking-tight leading-tight ${current ? 'font-bold text-text' : reached ? 'font-semibold text-text' : 'font-semibold text-text-light'}`}>
          {label}
        </p>
        {stamp && (
          // Who and when on separate lines on a phone, one line with a comma from sm up.
          <p className="flex flex-col sm:flex-row sm:gap-1 t-meta font-medium text-text-muted tabular-nums leading-tight">
            {author && <span>{author}<span className="hidden sm:inline">,</span></span>}
            <span>{formatStepDate(stamp)}, {formatStepTime(stamp)}</span>
          </p>
        )}
        <p className={`t-meta leading-relaxed whitespace-pre-wrap break-words ${reached ? 'text-text-secondary' : 'text-text-light'}`}>{note}</p>
      </div>
    </div>
  </li>
);

const TaskStatusStepper = ({ task, nameOf }: { task: Task; nameOf: (id: string | null | undefined) => string | undefined }) => {
  const isDraft = task.status === 'draft';
  // Newest first, so find() is the latest arrival in that status.
  const latest = (status: Task['status']) => (task.statusUpdates ?? []).find((u) => u.toStatus === status) ?? null;

  // On hold sits outside the four steps: the steps reached before the pause stay done, and an
  // "On hold since" row marks where it stopped.
  const hold = task.status === 'on_hold' ? latest('on_hold') : null;
  const heldFrom: Task['status'] = hold?.fromStatus === 'in_progress' ? 'in_progress' : 'todo';
  const currentIndex = task.status === 'on_hold' ? STATUS_ORDER.indexOf(heldFrom) : STATUS_ORDER.indexOf(task.status);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-1.5 t-section font-display font-bold text-text">
        <Milestone size={16} className="text-text-light" aria-hidden />
        Progress
      </h3>
      {isDraft && (
        <p className="t-meta font-display text-text-muted rounded-lg border border-border/60 bg-surface-hover/40 px-3 py-2">
          This is a draft, not published yet. Publish it to start the steps below.
        </p>
      )}

      <ol className="flex flex-col">
        {STATUS_ORDER.map((s, i) => {
          const isOnHold = task.status === 'on_hold';
          const reached = i <= currentIndex;
          const done = isOnHold ? reached : i < currentIndex;
          const current = !isOnHold && i === currentIndex;
          const arrival = reached ? latest(s) : null;
          const approval = s === 'done' && task.status === 'done' && task.verifiedAt ? task : null;
          const stamp = arrival ? new Date(arrival.createdAt)
            : approval ? new Date(approval.verifiedAt as string)
            : reached && s === 'todo' ? new Date(task.createdAt)
            : null;
          const author = arrival?.changedByUser?.firstName ?? (approval ? nameOf(approval.verifiedBy) : undefined);
          const note = arrival?.remark || (approval ? approval.verificationNote : null) || TIMELINE_STEP_DESCRIPTION[s];

          const row = (
            <StepRow
              key={s}
              label={STATUS_LABEL[s]}
              icon={STEP_ICON[s]}
              done={done}
              current={current}
              reached={reached}
              isLast={i === STATUS_ORDER.length - 1}
              stamp={stamp}
              author={author}
              note={note}
            />
          );

          if (!isOnHold || i !== currentIndex) return row;
          const since = hold ? new Date(hold.createdAt) : null;
          return [
            row,
            <StepRow
              key="on_hold"
              label={since ? `On hold since ${formatStepDate(since)}` : STATUS_LABEL.on_hold}
              icon={PauseCircle}
              done={false}
              current
              reached
              isLast={false}
              stamp={since}
              author={hold?.changedByUser?.firstName}
              note={hold?.remark || TIMELINE_STEP_DESCRIPTION.on_hold}
            />,
          ];
        })}
      </ol>
    </section>
  );
};


/**
 * The due date in the detail sheet. One due day by default; managers and up can add a start day.
 * Clearing it saves null.
 */
const TaskTimelineField = ({ task, onUpdate, canSetStart }: { task: Task; onUpdate: (payload: UpdateTaskPayload) => void; canSetStart: boolean }) => {
  const fromSaved = task.startDate ? new Date(task.startDate) : null;
  const toSaved = task.dueDate ? new Date(task.dueDate) : null;
  const savedKey = `${task.startDate ?? ''}|${task.dueDate ?? ''}`;
  const [draft, setDraft] = useState<DateRangeValue>({ from: fromSaved, to: toSaved });
  const [syncedKey, setSyncedKey] = useState(savedKey);
  const [showStart, setShowStart] = useState(!!task.startDate);
  if (savedKey !== syncedKey) {
    setSyncedKey(savedKey);
    setDraft({ from: fromSaved, to: toSaved });
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <DateRangePicker
        value={draft}
        dueOnly={!showStart}
        onChange={(range: DateRangeValue) => {
          setDraft(range);
          if (!range.from && !range.to) {
            onUpdate({ startDate: null, dueDate: null });
            return;
          }
          if (range.to) {
            onUpdate({ startDate: range.from ? range.from.toISOString() : null, dueDate: endOfDay(range.to).toISOString() });
          }
        }}
        placeholder="Add due date"
        triggerClassName={CHIP_TRIGGER_CLASS}
      />
      {canSetStart && !showStart && (
        <button
          type="button"
          onClick={() => setShowStart(true)}
          className="inline-flex items-center h-8 pointer-coarse:h-11 px-2 rounded-md t-meta font-display font-semibold text-text-secondary hover:text-text transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          Add start day
        </button>
      )}
    </div>
  );
};

const formatRangeDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const personName = (u: AssignableUser) => `${u.firstName}${u.lastName ? ` ${u.lastName}` : ''}`;

interface TaskEditLayoutProps {
  task: Task;
  isVerifier: boolean;
  isViewOnly: boolean;
  readOnlyReason: string | null;
  canEditText: boolean;
  canAttach: boolean;
  canRemoveFiles: boolean;
  currentUserId?: string;
  canReassign: boolean;
  allUsers: AssignableUser[] | undefined;
  isLoadingUsers: boolean;
  departments: ReturnType<typeof useDepartmentsQuery>['data'];
  isLoadingDepts: boolean;
  saveLabel: string | null;
  onSaveTitle: (title: string) => Promise<unknown>;
  onSaveDescription: (description: string) => Promise<unknown>;
  onDirtyChange: (field: 'title' | 'description', dirty: boolean) => void;
  onUpdate: (payload: UpdateTaskPayload) => void;
  onChangeDepartment: (departmentId: string | null) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

const TaskEditLayout = ({
  task, isVerifier, isViewOnly, readOnlyReason, canEditText, canAttach, canRemoveFiles, currentUserId, canReassign,
  allUsers, isLoadingUsers, departments, isLoadingDepts, saveLabel,
  onSaveTitle, onSaveDescription, onDirtyChange, onUpdate, onChangeDepartment, onDelete, isDeleting,
}: TaskEditLayoutProps) => {
  const departmentName = task.departmentId ? departments?.find((d) => d.id === task.departmentId)?.name : undefined;
  const selectedIds = taskAssigneeIds(task);
  // Same as the New delegation form: with a department set, the people picker lists that department's
  // people (plus whoever is already on it, so nobody silently drops off the chips).
  const pickerUsers = task.departmentId
    ? allUsers?.filter((u) => u.departmentId === task.departmentId || selectedIds.includes(u.id))
    : allUsers;

  const nameOf = (id: string | null | undefined) => {
    const person = id ? allUsers?.find((u) => u.id === id) : undefined;
    return person ? personName(person) : undefined;
  };
  const raisedBy = task.userId === currentUserId ? 'You' : nameOf(task.userId);
  const created = new Date(task.createdAt);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [lowerTab, setLowerTab] = useState<'progress' | 'activity'>('progress');
  const onTitleDirty = useCallback((d: boolean) => onDirtyChange('title', d), [onDirtyChange]);
  const onDescriptionDirty = useCallback((d: boolean) => onDirtyChange('description', d), [onDirtyChange]);
  const approvedOrSentBack = task.verificationNote
    ? (task.status === 'done' && task.verifiedBy ? 'approved' : task.status !== 'done' ? 'sentBack' : null)
    : null;

  return (
  <div className="flex-1 min-h-0 flex flex-col">
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar flex flex-col gap-4 sm:gap-5 p-4 sm:p-6 max-w-2xl mx-auto w-full">

      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <TitleEditor
            value={task.title}
            isViewMode={!canEditText}
            onSave={onSaveTitle}
            onDirtyChange={onTitleDirty}
          />
          {isVerifier && (
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => onDelete(task.id)}
              aria-label="Delete delegation"
              title="Delete delegation"
              className="flex items-center justify-center size-8 pointer-coarse:size-11 shrink-0 rounded-full text-text-light hover:text-danger hover:bg-danger/10 active:bg-danger/10 disabled:opacity-50 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40 [-webkit-tap-highlight-color:transparent]"
            >
              {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          )}
        </div>
        {/* Raised by on its own line on a phone; one line with a comma from sm up. */}
        <p className="flex flex-col sm:flex-row sm:gap-1 t-meta font-display font-medium text-text-muted">
          {raisedBy && <span>Raised by {raisedBy}<span className="hidden sm:inline">,</span></span>}
          <span>created {formatStepDate(created)}, {formatStepTime(created)}</span>
        </p>
        {saveLabel && <p className="t-meta font-display text-text-muted" role="status">{saveLabel}</p>}
      </div>

      {readOnlyReason && (
        <NoticeBanner tone="neutral" icon={Info}>{readOnlyReason}</NoticeBanner>
      )}

      <TaskStatusCard task={task} nameOf={nameOf} departmentName={departmentName} />

      {approvedOrSentBack && (
        <NoticeBanner tone={approvedOrSentBack === 'approved' ? 'success' : 'warning'} icon={approvedOrSentBack === 'approved' ? ShieldCheck : ShieldX}>
          <p className="font-bold">{approvedOrSentBack === 'approved' ? 'Approved' : 'Sent back for changes'}</p>
          <p className="whitespace-pre-wrap break-words">{task.verificationNote}</p>
        </NoticeBanner>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div title="Assigned to" aria-label="Assigned to" className="flex items-center min-w-0">
            <AssigneeField
              hideLabel
              selectedIds={selectedIds}
              onChange={(ids) => onUpdate({ assigneeId: ids[0] ?? null, additionalAssigneeIds: ids.slice(1) })}
              users={pickerUsers}
              isLoading={isLoadingUsers}
              disabled={isViewOnly || !canReassign}
            />
          </div>

          <span title="Priority" className="flex">
            <TaskPriorityChipPicker value={task.priority} onChange={(v) => onUpdate({ priority: v })} disabled={isViewOnly} />
          </span>

          {isViewOnly ? (
            task.dueDate && (
              <IconChip
                icon={CalendarDays}
                tone="bg-text-secondary"
                title="Due"
                label={task.startDate ? `${formatRangeDate(task.startDate)} to ${formatRangeDate(task.dueDate)}` : `Due ${formatRangeDate(task.dueDate)}`}
              />
            )
          ) : (
            <div title="Due">
              <TaskTimelineField task={task} onUpdate={onUpdate} canSetStart={canReassign} />
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
                onChange={(v) => onChangeDepartment(v || null)}
                departments={departments}
                isLoading={isLoadingDepts}
                triggerClassName={`${CHIP_TRIGGER_CLASS} max-w-[13rem]`}
              />
            </div>
          )}
        </div>

        {!isViewOnly && !canReassign && (
          <p className="t-meta font-medium text-text-light">Only a manager or above can change the people or the department.</p>
        )}

        {(task.reviewers?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 t-meta text-text-secondary">
            <ShieldCheck size={14} className="text-text-light shrink-0" />
            <span>Reviewers: {task.reviewers!.map((r) => `${r.firstName}${r.lastName ? ` ${r.lastName}` : ''}`).join(', ')}</span>
          </div>
        )}
      </div>

      <DetailLabelsField
        current={task.tags ?? []}
        onSave={(tagIds) => onUpdate({ tagIds })}
        canCreate={isVerifier}
        readOnly={isViewOnly}
        hideHeading
        headingClassName={DETAIL_HEADING_CLASS}
      />

      <PlainDescriptionEditor
        value={task.description ?? ''}
        disabled={!canEditText}
        onSave={onSaveDescription}
        onDirtyChange={onDescriptionDirty}
      />

      <TaskAttachments
        taskId={task.id}
        attachments={task.attachments ?? []}
        canEdit={canAttach}
        canRemove={canRemoveFiles}
        onPreview={setPreviewImage}
      />

      {/* The server won't take "Mark completed" while a checklist item is neither done nor explained,
          so the checklists are worked right here. */}
      {(task.checklists?.length ?? 0) > 0 && (
        <TaskChecklistPanel
          taskId={task.id}
          checklists={task.checklists ?? []}
          isAdmin={isVerifier}
          currentUserId={currentUserId}
        />
      )}

      <div role="tablist" aria-label="Delegation history" className="sm:hidden grid grid-cols-2 gap-2">
        {(['progress', 'activity'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={lowerTab === k}
            onClick={() => setLowerTab(k)}
            className={`h-11 rounded-full border t-card font-display cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors duration-150 ease-out [-webkit-tap-highlight-color:transparent] ${
              lowerTab === k ? 'border-border-hover bg-surface-hover text-text font-bold' : 'border-border bg-surface text-text-secondary font-semibold'
            }`}
          >
            {k === 'progress' ? 'Progress' : 'Activity'}
          </button>
        ))}
      </div>

      <div className={lowerTab === 'progress' ? '' : 'max-sm:hidden'}>
        <TaskStatusStepper task={task} nameOf={nameOf} />
      </div>

      <div className={`flex flex-col gap-4 sm:gap-5 ${lowerTab === 'activity' ? '' : 'max-sm:hidden'}`}>
        <ActivityFeed entityType="Task" entityId={task.id} />
        <FullChangeLog entityType="Task" entityId={task.id} />
      </div>
    </div>

    <ImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />
  </div>
  );
};

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
  initialMode?: 'view' | 'edit';
}

export const TaskDetail = ({ task: initialTask, onClose }: TaskDetailProps) => {
  const { data: fresh } = useTaskQuery(initialTask.id);
  const task = fresh ?? initialTask;
  const { user } = useAuth();

  const [advanceTo, setAdvanceTo] = useState<Task['status'] | null>(null);
  const [dirtyFields, setDirtyFields] = useState<{ title: boolean; description: boolean }>({ title: false, description: false });
  // A title or description edit not yet saved (or whose save failed) makes closing ask first.
  const handleDirtyChange = useCallback((field: 'title' | 'description', dirty: boolean) => {
    setDirtyFields((prev) => (prev[field] === dirty ? prev : { ...prev, [field]: dirty }));
  }, []);

  const isPC = user?.role === 'PC';
  // Same rules as the server's update(), in one shared place (taskPermissions): who may move the
  // status, and who may change the details. A Manager looking at a colleague's delegation, PC, an
  // approval manager, front-line staff on work given to them, and anyone but an Admin once it is
  // approved all get a read-only sheet, with the reason said at the top.
  const canMove = canMoveTask(task, user);
  const isViewOnly = !canEditTaskContent(task, user);
  const readOnlyReason = viewOnlyReason(task, user);
  const isVerifier = isPC || user?.role === 'ADMIN';
  const canReassign = user?.role !== 'AGENT' && user?.role !== 'USER';
  const canEditText = !isViewOnly;
  const canAttach = user?.role !== 'APPROVAL_MANAGER' && (
    user?.role === 'ADMIN' || user?.role === 'PC' || task.userId === user?.id || (!!user && taskAssigneeIds(task).includes(user.id))
  );
  // Files on an approved delegation are part of the record: only an Admin may take one off.
  const canRemoveFiles = canAttach && (task.status !== 'done' || user?.role === 'ADMIN');
  const nextStatus = NEXT_STATUS[task.status as keyof typeof NEXT_STATUS];

  // Three mutation instances, so a field save never spins the status button and vice versa:
  // chips and dates (error toast), title and description (failure shown beside the field), status.
  const fieldMutation = useUpdateTaskMutation({ silent: true });
  const textMutation = useUpdateTaskMutation({ silent: true, quietErrors: true });
  const statusMutation = useUpdateTaskMutation({ silent: true });
  const deleteMutation = useDeleteTaskMutation();
  const confirm = useConfirm();
  const { data: allUsers, isLoading: isLoadingUsers } = useAssignableUsersQuery();
  const { data: departments, isLoading: isLoadingDepts } = useDepartmentsQuery();

  const handleUpdate = (payload: UpdateTaskPayload) => {
    fieldMutation.mutate({ id: task.id, payload });
  };

  const saveTitle = (title: string) => textMutation.mutateAsync({ id: task.id, payload: { title } });
  const saveDescription = (description: string) => textMutation.mutateAsync({ id: task.id, payload: { description } });

  // Narrowing to a department takes off anyone who isn't in it, after asking.
  const changeDepartment = async (departmentId: string | null) => {
    if (departmentId === (task.departmentId ?? null)) return;
    const current = taskAssigneeIds(task);
    const outside = departmentId
      ? current.filter((id) => allUsers?.find((u) => u.id === id)?.departmentId !== departmentId)
      : [];
    if (!outside.length) {
      handleUpdate({ departmentId });
      return;
    }
    const deptName = departments?.find((d) => d.id === departmentId)?.name ?? 'that department';
    const names = outside.map((id) => {
      const u = allUsers?.find((p) => p.id === id);
      return u ? personName(u) : 'Someone';
    }).join(', ');
    const ok = await confirm({
      title: `Move to ${deptName}?`,
      description: `${names} ${outside.length === 1 ? 'is' : 'are'} not in ${deptName} and will be taken off this delegation.`,
      confirmLabel: 'Move and take off',
      cancelLabel: 'Keep as is',
    });
    if (!ok) return;
    const kept = current.filter((id) => !outside.includes(id));
    handleUpdate({ departmentId, assigneeId: kept[0] ?? null, additionalAssigneeIds: kept.slice(1) });
  };

  // Publishing a draft is its first step out, not a status change anyone needs to explain: same
  // fixed note as the Drafts page, and the same check for what it still lacks.
  const publish = () => {
    const problem = draftPublishProblem(task);
    if (problem) {
      toast.error(problem);
      return;
    }
    statusMutation.mutate(
      { id: task.id, payload: { status: 'todo', statusRemark: PUBLISH_REMARK } },
      { onSuccess: () => toast.success('Delegation published') },
    );
  };

  const anyFieldSaving = fieldMutation.isPending || textMutation.isPending;
  const anySaved = fieldMutation.isSuccess || textMutation.isSuccess;
  const saveLabel = !canEditText ? null : anyFieldSaving ? 'Saving…' : anySaved ? 'Saved' : null;

  return (
    <Modal
      open
      description={
        <span className="hidden sm:inline">
          {canEditText ? 'Changes save on their own as you edit each field.' : 'Review this delegation’s details.'}
        </span>
      }
      onClose={onClose}
      dirty={dirtyFields.title || dirtyFields.description}
      size="xl"
      icon={<CheckSquare className="w-5 h-5 text-primary-600" />}
      title="Delegation details"
      bodyClassName="p-0 overflow-hidden rounded-b-xl"
      footer={
        <TaskFooter
          task={task}
          canMove={canMove}
          canApprove={canApproveWork(user, { departmentId: task.departmentId ?? null, assigneeIds: taskAssigneeIds(task), reviewers: task.reviewers })}
          nextStatus={nextStatus}
          onAdvance={() => {
            if (task.status === 'draft') publish();
            else if (nextStatus) setAdvanceTo(nextStatus);
          }}
          onHold={CAN_HOLD.includes(task.status) ? () => setAdvanceTo('on_hold') : null}
          onBack={BACK_STATUS[task.status] ? () => setAdvanceTo(BACK_STATUS[task.status] as Task['status']) : null}
          onReopen={task.status === 'done' && user?.role === 'ADMIN' ? () => setAdvanceTo('in_progress') : null}
          isAdvancing={statusMutation.isPending}
          onClose={onClose}
        />
      }
    >

      <div className="flex flex-col md:flex-row flex-1 min-h-0 md:min-h-[min(30rem,60dvh)]">
        <TaskEditLayout
          task={task}
          isVerifier={isVerifier}
          isViewOnly={isViewOnly}
          readOnlyReason={readOnlyReason}
          canEditText={canEditText}
          canAttach={canAttach}
          canRemoveFiles={canRemoveFiles}
          currentUserId={user?.id}
          canReassign={canReassign}
          allUsers={allUsers}
          isLoadingUsers={isLoadingUsers}
          departments={departments}
          isLoadingDepts={isLoadingDepts}
          saveLabel={saveLabel}
          onSaveTitle={saveTitle}
          onSaveDescription={saveDescription}
          onDirtyChange={handleDirtyChange}
          onUpdate={handleUpdate}
          onChangeDepartment={(id) => void changeDepartment(id)}
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


      {advanceTo && (
        <TaskStatusRemarkDialog
          nested
          task={task}
          toStatus={advanceTo}
          isSubmitting={statusMutation.isPending}
          onCancel={() => setAdvanceTo(null)}
          onConfirm={(statusRemark) => {
            const toStatus = advanceTo;
            statusMutation.mutate(
              { id: task.id, payload: { status: toStatus, statusRemark: statusRemark || undefined } },
              {
                onSuccess: () => {
                  setAdvanceTo(null);
                  toast.success(task.status === 'done' ? 'Delegation reopened'
                    : toStatus === 'pending_approval' ? 'Marked completed, waiting for approval'
                    : `Moved to ${STATUS_LABEL[toStatus]}`);
                },
              },
            );
          }}
        />
      )}
    </Modal>
  );
};
