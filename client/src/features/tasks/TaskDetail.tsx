import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Loader2, ChevronRight, MoreHorizontal, Undo2, PauseCircle, CircleDot, Clock, Eye, CheckCircle2, ShieldCheck, ShieldX, CalendarDays, Check, Milestone, RotateCcw, Info, UserRound, Flag, Building2 } from 'lucide-react';
import { Button, DateRangePicker, ImageLightbox, NoticeBanner, useConfirm } from '../../components';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ActivitySheet } from '../../components/activitySheet';
import type { DateRangeValue } from '../../components';
import { useTaskQuery, useUpdateTaskMutation, useDeleteTaskMutation, useAssignableUsersQuery } from './hook';
import { useDepartmentsQuery } from '../tickets/hook';
import { TaskVerifyActions } from './TaskVerifyActions';
import { TaskFormDepartmentField } from './TaskFormDepartmentField';
import { AssigneeField } from '../assignees/AssigneeField';
import { TaskDescriptionField } from './TaskDescriptionField';
import { TaskChecklistPanel } from './TaskChecklistPanel';
import { TicketDescription } from '../tickets/detail/TicketDescription';
import { STATUS_LABEL, NEXT_STATUS, endOfDay, PRIORITY_MAP, taskCode } from './taskDisplay';
import { TaskDetailHeader } from './TaskDetailHeader';
import { TaskStatusCard } from './TaskStatusCard';
import { FORWARD_LABEL, BACK_STATUS, BACK_LABEL, CAN_HOLD, PUBLISH_REMARK, draftPublishProblem } from './taskStatusModel';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { TaskPriorityChipPicker } from './TaskPriorityChipPicker';
import { DETAIL_HEADING_CLASS } from './taskFormFieldStyles';
import { TaskStatusRemarkDialog } from './TaskStatusRemarkDialog';
import { TaskAttachments } from './TaskAttachments';
import { DetailLabelsField } from '../tags/DetailLabelsField';
import { taskScore } from '../../lib/itemScore';
import { ItemScoreCard } from '../../components/itemScoreCard/ItemScoreCard';
import { taskAssigneeIds } from './cardFields';
import { useAuth } from '../../context/AuthContext';
import type { Task, UpdateTaskPayload } from '../../api/task';
import type { AssignableUser } from '../../api/users';
import { canApproveTicket, isFinalApproval, taskApprovalSubject } from '../../lib/ticketApproval';
import { TaskApprovalTrail } from './TaskApprovalTrail';
import { TaskHeadDecision } from './TaskHeadDecision';
import { canAssignTask, canEditTaskContent, canMoveTask, viewOnlyReason } from './taskPermissions';
import { TicketPropertyRow } from '../tickets/detail/TicketPropertyRow';
import { PROPERTY_TRIGGER_CLASS, PROPERTY_VALUE_CLASS, dueTone } from '../tickets/detail/propertyStyles';
import { cn } from '@/lib/utils';
import { DETAIL_SECTION_HEADING, DETAIL_SECTION_TILE } from '../tickets/detail/detailConstants';

type SaveState = 'idle' | 'saving' | 'error';

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
    return <h2 className="t-title font-display font-bold text-text leading-snug break-words select-text">{value}</h2>;
  }

  const handleBlur = () => {
    const trimmed = text.trim();
    if (!trimmed) {
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
        className="block t-title font-display font-bold leading-snug w-full px-3 py-1 -ml-3 rounded-md border-0 bg-transparent text-text resize-none overflow-hidden outline-none transition-colors duration-150 ease-out focus:bg-surface-hover/50 focus:ring-2 focus:ring-primary-500/30"
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
          <p className="text-sm text-text leading-relaxed whitespace-pre-wrap break-words select-text">{value}</p>
        ) : (
          <p className="text-sm text-text-light italic">No description added.</p>
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
        rows={3}
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
  canMove: boolean;
  canApprove: boolean;
  finalApproval: boolean;
  nextStatus: Task['status'] | null;
  onAdvance: () => void;
  onBack: (() => void) | null;
  onHold: (() => void) | null;
  onReopen: (() => void) | null;
  isAdvancing: boolean;
  onClose: () => void;
}

const TaskFooter = ({ task, canMove, canApprove, finalApproval, nextStatus, onAdvance, onBack, onHold, onReopen, isAdvancing, onClose }: TaskFooterProps) => {
  const needsDecision = canApprove && task.status === 'pending_approval';
  const showAdvance = !!nextStatus && canMove;
  const hasMenu = canMove && (onBack || onHold || onReopen);
  const menu = hasMenu ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 px-2.5 pointer-coarse:min-w-11" aria-label="More status actions">
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
  ) : null;

  if (needsDecision) {
    return (
      <div className="flex items-start gap-2 w-full">
        <div className="flex-1 min-w-0">
          <TaskVerifyActions task={task} onDecided={onClose} nested finalApproval={finalApproval} />
        </div>
        {menu}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between w-full gap-3">
      <div className="hidden sm:flex items-center gap-3 flex-wrap">
        {task.status === 'done' && !task.declinedAt && (
          <span className="flex items-center gap-1.5 t-meta font-semibold text-success">
            <CheckCircle2 size={15} /> Approved
          </span>
        )}
        {task.status === 'pending_approval' && (
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
        {menu}
        {!showAdvance && (
          <Button variant="outline" size="sm" onClick={onClose} className="sm:hidden flex-1">
            Close
          </Button>
        )}
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
        className={`flex items-center justify-center size-6 rounded-full shrink-0 transition-colors duration-200 ${
          done
            ? 'bg-success text-white'
            : current
              ? 'border-2 border-text-secondary bg-surface text-text'
              : 'border-2 border-border bg-surface text-text-light'
        }`}
      >
        {done ? <Check size={12} strokeWidth={3} /> : <StepIcon size={12} strokeWidth={2.5} />}
      </span>
      {!isLast && <span className={`w-0.5 flex-1 min-h-5 my-1 rounded-full ${done ? 'bg-success/50' : 'bg-border'}`} />}
    </div>

    <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-3'}`}>
      <div className={`flex flex-col gap-1 ${current ? 'rounded-lg border border-primary-500/25 bg-surface px-3 py-2 -mt-1' : 'pt-0.5'}`}>
        <p className={`t-meta font-display leading-tight ${current ? 'font-bold text-text' : reached ? 'font-semibold text-text' : 'font-semibold text-text-light'}`}>
          {label}
        </p>
        {stamp && (
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
  const latest = (status: Task['status']) => (task.statusUpdates ?? []).find((u) => u.toStatus === status) ?? null;

  const hold = task.status === 'on_hold' ? latest('on_hold') : null;
  const heldFrom: Task['status'] = hold?.fromStatus === 'in_progress' ? 'in_progress' : 'todo';
  const currentIndex = task.status === 'on_hold' ? STATUS_ORDER.indexOf(heldFrom) : STATUS_ORDER.indexOf(task.status);

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={DETAIL_SECTION_HEADING}>
        <span className={DETAIL_SECTION_TILE} aria-hidden="true"><Milestone size={14} strokeWidth={2.25} /></span>
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

const TaskDueRow = ({ task, onUpdate, canSetStart, isViewOnly }: { task: Task; onUpdate: (payload: UpdateTaskPayload) => void; canSetStart: boolean; isViewOnly: boolean }) => {
  const late = taskIsLate(task);
  return (
    <TicketPropertyRow
      wide
      label="Due"
      icon={CalendarDays}
      tone={dueTone(late)}
    >
      {isViewOnly ? (
        task.dueDate ? (
          <span className={cn(PROPERTY_VALUE_CLASS, late && 'text-danger')}>
            {task.startDate && !late ? `${formatRangeDate(task.startDate)} to ${taskDueWords(task.dueDate)}` : late ? `Late since ${formatRangeDate(task.dueDate)}` : taskDueWords(task.dueDate)}
          </span>
        ) : <span className="t-meta text-text-light">No due date</span>
      ) : (
        <TaskTimelineField task={task} onUpdate={onUpdate} canSetStart={canSetStart} />
      )}
    </TicketPropertyRow>
  );
};

const TaskTimelineField = ({ task, onUpdate, canSetStart }: { task: Task; onUpdate: (payload: UpdateTaskPayload) => void; canSetStart: boolean }) => {
  const fromSaved = task.startDate ? new Date(task.startDate) : null;
  const toSaved = task.dueDate ? new Date(task.dueDate) : null;
  const savedKey = `${task.startDate ?? ''}|${task.dueDate ?? ''}`;
  const [draft, setDraft] = useState<DateRangeValue>({ from: fromSaved, to: toSaved });
  const [syncedKey, setSyncedKey] = useState(savedKey);
  if (savedKey !== syncedKey) {
    setSyncedKey(savedKey);
    setDraft({ from: fromSaved, to: toSaved });
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <DateRangePicker
        tiles
        showTime
        hidePresets
        invalid={taskIsLate(task)}
        value={draft}
        dueOnly={!canSetStart && !task.startDate}
        onChange={(range: DateRangeValue) => {
          setDraft(range);
          if (!range.from && !range.to) {
            onUpdate({ startDate: null, dueDate: null });
            return;
          }
          if (range.to) {
            const due = range.to.getHours() || range.to.getMinutes() ? range.to : endOfDay(range.to);
            onUpdate({ startDate: range.from ? range.from.toISOString() : null, dueDate: due.toISOString() });
          }
        }}
        placeholder="Add due date"
      />
    </div>
  );
};

const formatRangeDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const taskIsLate = (task: Task) =>
  !!task.dueDate && !(['done', 'pending_approval', 'draft'] as Task['status'][]).includes(task.status) && new Date(task.dueDate).getTime() < Date.now();

const taskDueWords = (iso: string) => {
  const day = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(day) - startOf(new Date())) / 86_400_000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : formatRangeDate(iso);
};

const personName = (u: AssignableUser) => `${u.firstName}${u.lastName ? ` ${u.lastName}` : ''}`;

interface TaskEditLayoutProps {
  task: Task;
  isVerifier: boolean;
  isViewOnly: boolean;
  readOnlyReason: string | null;
  canEditText: boolean;
  editing: boolean;
  canAttach: boolean;
  canRemoveFiles: boolean;
  currentUserId?: string;
  canReassign: boolean;
  canAssign: boolean;
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
}

const TaskEditLayout = ({
  task, isVerifier, isViewOnly, readOnlyReason, canEditText, editing, canAttach, canRemoveFiles, currentUserId, canReassign, canAssign,
  allUsers, isLoadingUsers, departments, isLoadingDepts, saveLabel,
  onSaveTitle, onSaveDescription, onDirtyChange, onUpdate, onChangeDepartment,
}: TaskEditLayoutProps) => {
  const departmentName = task.departmentId ? departments?.find((d) => d.id === task.departmentId)?.name : undefined;
  const selectedIds = taskAssigneeIds(task);
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
  const onTitleDirty = useCallback((d: boolean) => onDirtyChange('title', d), [onDirtyChange]);
  const onDescriptionDirty = useCallback((d: boolean) => onDirtyChange('description', d), [onDirtyChange]);
  const approvedOrSentBack = task.verificationNote
    ? (task.status === 'done' && task.verifiedBy ? 'approved' : task.status !== 'done' ? 'sentBack' : null)
    : null;

  const propertiesBlock = (
    <aside
      aria-label="Delegation properties"
      className="flex flex-col gap-4 min-w-0 max-lg:rounded-xl max-lg:border max-lg:border-border/60 max-lg:bg-surface-hover/30 max-lg:p-3 sm:max-lg:p-4 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:sticky lg:top-0 lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:p-5"
    >
      <div className="flex flex-col gap-2">
        <dl className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:gap-0 lg:divide-y lg:divide-border/60">
          <TicketPropertyRow wide label="Assigned to" icon={UserRound} tone="bg-linear-to-br from-primary-500 to-primary-600">
            <AssigneeField
              hideLabel
              selectedIds={selectedIds}
              onChange={(ids) => onUpdate({ assigneeId: ids[0] ?? null, additionalAssigneeIds: ids.slice(1) })}
              users={pickerUsers}
              isLoading={isLoadingUsers}
              disabled={!canAssign}
            />
          </TicketPropertyRow>

          <TicketPropertyRow wide label="Priority" icon={Flag} tone={PRIORITY_MAP[task.priority].solid}>
            <TaskPriorityChipPicker value={task.priority} onChange={(v) => onUpdate({ priority: v })} disabled={isViewOnly} fullWidth triggerClassName={PROPERTY_TRIGGER_CLASS} />
          </TicketPropertyRow>

          <TicketPropertyRow wide label="Department" icon={Building2} tone="bg-linear-to-br from-coral-500 to-coral-600">
            {isViewOnly || !canReassign ? (
              departmentName ? <span className={PROPERTY_VALUE_CLASS}>{departmentName}</span> : <span className="t-meta text-text-light">None</span>
            ) : (
              <div className="w-full min-w-0">
                <TaskFormDepartmentField
                  hideLabel
                  value={task.departmentId ?? ''}
                  onChange={(v) => onChangeDepartment(v || null)}
                  departments={departments}
                  isLoading={isLoadingDepts}
                  triggerClassName={PROPERTY_TRIGGER_CLASS}
                />
              </div>
            )}
          </TicketPropertyRow>

          <TaskDueRow task={task} onUpdate={onUpdate} canSetStart={canReassign} isViewOnly={isViewOnly} />
        </dl>

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

      {!task.declinedAt && !task.awaitingHeadApproval && <ItemScoreCard scoreAt={(now) => taskScore(task, now)} noun="delegation" />}

      <DetailLabelsField
        current={task.tags ?? []}
        onSave={(tagIds) => onUpdate({ tagIds })}
        canCreate={isVerifier}
        readOnly={isViewOnly}
        iconOnly
        headingClassName={DETAIL_HEADING_CLASS}
      />
    </aside>
  );

  return (
    <>
      <div className="flex flex-col gap-4 sm:gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-x-8 lg:gap-y-5">
        <div className="flex flex-col gap-4 sm:gap-5 min-w-0 lg:col-start-1">
          <div className="flex flex-col gap-2">
            <TitleEditor
              value={task.title}
              isViewMode={!canEditText || !editing}
              onSave={onSaveTitle}
              onDirtyChange={onTitleDirty}
            />
            {saveLabel && editing && <p className="t-meta font-display text-text-muted" role="status">{saveLabel}</p>}

            {canEditText && editing ? (
              <PlainDescriptionEditor
                value={task.description ?? ''}
                disabled={false}
                onSave={onSaveDescription}
                onDirtyChange={onDescriptionDirty}
              />
            ) : (
              <TicketDescription description={task.description ?? ''} />
            )}
          </div>

          {readOnlyReason && (
            <NoticeBanner tone="neutral" icon={Info}>{readOnlyReason}</NoticeBanner>
          )}

          {task.status !== 'done' && task.status !== 'pending_approval' && <TaskStatusCard task={task} nameOf={nameOf} departmentName={departmentName} hideChip />}

          <TaskHeadDecision task={task} departmentName={departmentName} departments={departments} nameOf={nameOf} />

          {!task.declinedAt && (task.status === 'pending_approval' || (task.status === 'done' && !!task.verifiedAt)) && <TaskApprovalTrail task={task} />}

          {approvedOrSentBack && (
            <NoticeBanner tone={approvedOrSentBack === 'approved' ? 'success' : 'warning'} icon={approvedOrSentBack === 'approved' ? ShieldCheck : ShieldX}>
              <p className="font-bold">{approvedOrSentBack === 'approved' ? 'Approved' : 'Sent back for changes'}</p>
              <p className="whitespace-pre-wrap break-words">{task.verificationNote}</p>
            </NoticeBanner>
          )}
        </div>

        {propertiesBlock}

        <div className="flex flex-col gap-4 sm:gap-5 min-w-0 lg:col-start-1">
          <TaskAttachments
            taskId={task.id}
            attachments={task.attachments ?? []}
            canEdit={canAttach}
            canRemove={canRemoveFiles}
            onPreview={setPreviewImage}
          />

          {(task.checklists?.length ?? 0) > 0 && (
            <TaskChecklistPanel
              taskId={task.id}
              checklists={task.checklists ?? []}
              isAdmin={isVerifier}
              currentUserId={currentUserId}
              workerIds={taskAssigneeIds(task)}
            />
          )}

          {!task.declinedAt && <TaskStatusStepper task={task} nameOf={nameOf} />}

          <p className="flex items-center gap-1.5 pt-3 border-t border-border/50 t-meta font-medium text-text-muted">
            <CalendarDays size={12} className="shrink-0 text-text-light" strokeWidth={2.25} aria-hidden="true" />
            {raisedBy ? `Raised by ${raisedBy}` : 'Raised'}, {formatStepDate(created)}, {formatStepTime(created)}
          </p>
        </div>
      </div>

      <ImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />
    </>
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
  const [editing, setEditing] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [dirtyFields, setDirtyFields] = useState<{ title: boolean; description: boolean }>({ title: false, description: false });
  const handleDirtyChange = useCallback((field: 'title' | 'description', dirty: boolean) => {
    setDirtyFields((prev) => (prev[field] === dirty ? prev : { ...prev, [field]: dirty }));
  }, []);

  const isPC = user?.role === 'PC';

  const canMove = canMoveTask(task, user);
  const isViewOnly = !canEditTaskContent(task, user);
  const readOnlyReason = viewOnlyReason(task, user);
  const isVerifier = isPC || user?.role === 'ADMIN';
  const canReassign = user?.role !== 'AGENT' && user?.role !== 'USER';
  const canAssign = canReassign && canAssignTask(task, user);
  const canEditText = !isViewOnly;
  const canAttach = user?.role !== 'APPROVAL_MANAGER' && (
    user?.role === 'ADMIN' || user?.role === 'PC' || task.userId === user?.id || (!!user && taskAssigneeIds(task).includes(user.id))
  );
  const canRemoveFiles = canAttach && (task.status !== 'done' || user?.role === 'ADMIN');
  const nextStatus = NEXT_STATUS[task.status as keyof typeof NEXT_STATUS];

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

  const dirty = dirtyFields.title || dirtyFields.description;
  const requestClose = async () => {
    if (!dirty) return onClose();
    const ok = await confirm({
      title: 'Discard changes?',
      description: 'Your edits to this delegation will be lost.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      variant: 'danger',
    });
    if (ok) onClose();
  };
  const askDelete = async () => {
    const ok = await confirm({
      title: 'Delete this delegation?',
      description: 'It is removed from the lists.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteMutation.mutate(task.id, { onSuccess: onClose });
  };
  const raisedByName = task.userId === user?.id ? 'You' : allUsers?.find((u) => u.id === task.userId)?.firstName;
  const sheetRef = useRef<HTMLDivElement>(null);

  return (
    <Sheet open onOpenChange={(v) => { if (!v) void requestClose(); }}>
      <SheetContent
        showCloseButton={false}
        ref={sheetRef}
        onInteractOutside={(e) => { if (dirty) e.preventDefault(); }}
        onOpenAutoFocus={(e) => { e.preventDefault(); sheetRef.current?.focus({ preventScroll: true }); }}
        className="w-full sm:max-w-[600px] md:max-w-[680px] lg:max-w-[880px] xl:max-w-[1040px] p-0 flex flex-col h-full overflow-hidden font-sans shadow-none"
      >
        <TaskDetailHeader
          task={task}
          raisedBy={raisedByName}
          onShowActivity={() => setActivityOpen(true)}
          onEdit={canEditText ? () => setEditing((v) => !v) : undefined}
          editing={editing}
          onDelete={isVerifier ? () => void askDelete() : undefined}
          isDeleting={deleteMutation.isPending}
        />

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-1 pb-4 sm:px-6 sm:pt-1.5 sm:pb-5 lg:px-8 lg:pt-2 lg:pb-6 custom-scrollbar">
          <TaskEditLayout
            task={task}
            isVerifier={isVerifier}
            isViewOnly={isViewOnly}
            readOnlyReason={readOnlyReason}
            canEditText={canEditText}
            editing={editing}
            canAttach={canAttach}
            canRemoveFiles={canRemoveFiles}
            currentUserId={user?.id}
            canReassign={canReassign}
            canAssign={canAssign}
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
          />
        </div>

        <div className="shrink-0 border-t border-border/60 bg-surface px-4 py-3 sm:px-6 lg:px-8">
          <TaskFooter
            task={task}
            canMove={canMove}
            canApprove={canApproveTicket(user, taskApprovalSubject(task))}
            finalApproval={isFinalApproval(user, task)}
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
        </div>

        <ActivitySheet entityType="Task" entityId={task.id} code={taskCode(task.id)} open={activityOpen} onOpenChange={setActivityOpen} />
      </SheetContent>

      {advanceTo && (
        <TaskStatusRemarkDialog
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

    </Sheet>
  );
};
