import {
  Loader2,
  Trash2,
  MoveRight,
  User,
  UserCog,
  ShieldQuestion,
  CalendarPlus,
  CalendarDays,
  History,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";
import { useDeleteTaskMutation, usePrefetchTask } from "./hook";
import { TaskVerifyActions } from "./TaskVerifyActions";
import { useAuth } from "../../context/AuthContext";
import { canApproveTicket, isFinalApproval, taskApprovalSubject } from "../../lib/ticketApproval";
import { PRIORITY_MAP } from "./taskDisplay";
import { isOverdueTask, OVERDUE_EXEMPT_STATUSES } from "./taskFilters";
import { isMoveBlocked } from "./taskStatusModel";
import { TaskScoreBadge } from "./TaskScoreBadge";
import { TaskSourceBadge } from "./TaskSourceBadge";
import { TaskFlowChips } from "./TaskFlowChips";
import { taskFlowState } from "./taskFlow";
import { coverPhotoFor } from "./taskAttachmentDisplay";
import { UPLOADS_BASE } from "../../lib/uploadsBase";
import { avatarColorClass } from "../../lib/avatarColors";
import { StatusChip } from "../../components/statusChip";
import { PriorityChip } from "../../components/priorityChip";
import { DepartmentChip } from "../../components/departmentChip";
import { IconChip } from "../../components/iconChip";
import { getInitials } from "../../lib/getInitials";
import { getTaskChecklistProgress } from "../../lib/checklistProgress";
import { ChecklistProgressBar } from "../../components/progress";
import { CATEGORY_CONFIG, formatShortDate, formatShortDateTime, type CardFieldVisibility } from "./cardFields";
import { STATUS_LABEL, STATUS_ICON, MOVABLE_STATUSES } from "./taskDisplay";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { useConfirm } from "../../components";
import type { Task } from "../../api/task";

interface TaskCardProps {
  task: Task;
  assigneeNames?: string[];
  raisedByName?: string;
  departmentName?: string;
  isVerifier: boolean;
  onOpen: (task: Task, mode?: 'view' | 'edit') => void;
  index?: number;
  fields: CardFieldVisibility;
  isNewlyAssigned?: boolean;
  onMove?: (task: Task, toStatus: Task['status']) => void;
  priorityRail?: boolean;
}

const MAX_VISIBLE_AVATARS = 3;

const daysLeftLabel = (dueDate: string) => {
  const diffMs = new Date(dueDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  const days = Math.round(diffMs / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `${days} day${days === 1 ? '' : 's'} left`;
};

export const TaskCard = ({ task, assigneeNames = [], raisedByName, departmentName, isVerifier, onOpen, fields, isNewlyAssigned, onMove, priorityRail = false }: TaskCardProps) => {
  const deleteMutation = useDeleteTaskMutation();
  const confirm = useConfirm();
  const priority = PRIORITY_MAP[task.priority];
  const coverPhoto = coverPhotoFor(task.attachments);
  const isOverdue = isOverdueTask(task);
  const { doneItems, totalItems, progress } = getTaskChecklistProgress(task);

  const { user } = useAuth();
  const flow = taskFlowState(task, user);
  const showDoneBadge = fields.status && task.status === 'done' && !flow.declined;
  const showDeclinedBadge = fields.status && flow.declined;
  const canApprove = canApproveTicket(user, taskApprovalSubject(task));
  const showReviewBadge = fields.status && task.status === 'pending_approval' && !canApprove;
  const showVerifyActions = task.status === 'pending_approval' && canApprove;

  const showChecklistBar = fields.subtasks && progress !== null;
  const showDueCell = fields.dueDate && !!task.dueDate;
  const clockStopped = OVERDUE_EXEMPT_STATUSES.has(task.status);
  const dueIsToday = !!task.dueDate && !clockStopped && !isOverdue && new Date(task.dueDate).toDateString() === new Date().toDateString();
  const dueTone = task.status === 'done' ? 'text-text-secondary' : isOverdue ? 'text-danger' : dueIsToday ? 'text-warning' : 'text-text';
  const showScoreBadge = fields.status && task.status !== 'done' && task.status !== 'pending_approval' && !flow.awaiting;

  const prefetchHandlers = usePrefetchTask(task.id);

  return (
    <div
      {...prefetchHandlers}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(task);
        }
      }}
      role="button"
      tabIndex={0}
      className={`group relative flex flex-col gap-2 p-3.5 rounded-lg border border-border bg-surface hover:border-primary-500/40 transition-colors duration-200 cursor-pointer select-none active:bg-surface-hover/50 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 overflow-hidden [-webkit-tap-highlight-color:transparent] ${priorityRail ? 'pl-4' : ''}`}
    >
      {priorityRail && (
        <span
          aria-hidden
          className={`absolute left-0 top-0 bottom-0 w-1 ${priority.stripe}`}
        />
      )}

      {isNewlyAssigned && raisedByName && (
        <div className="flex items-center gap-1.5 -mt-1 -mx-1 px-2.5 py-1.5 rounded-lg bg-info/10 t-meta font-semibold text-info">
          <UserCog size={12} strokeWidth={2.5} className="shrink-0" />
          <span className="truncate">New from {raisedByName}. Please take a look.</span>
        </div>
      )}

      <div className="flex items-start gap-2">
        <h4 className={`flex-1 min-w-0 t-card sm:text-sm font-display font-semibold text-text leading-snug line-clamp-2 break-words ${onMove || isVerifier ? 'pr-9' : ''}`}>
          {task.title}
        </h4>
        <TaskSourceBadge aiMeta={task.aiMeta} />
      </div>

      <div className="absolute top-2 right-2 z-10" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Delegation actions"
              className="flex items-center justify-center size-8 pointer-coarse:size-11 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <MoreHorizontal size={16} strokeWidth={2.5} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onOpen(task)} className="gap-2.5 py-2 cursor-pointer">
              <ExternalLink size={15} />
              <span className="font-medium text-sm">Open</span>
            </DropdownMenuItem>
            {onMove && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2.5 py-2 cursor-pointer">
                  <MoveRight size={15} />
                  <span className="font-medium text-sm">Move to</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-52 rounded-xl">
                  <DropdownMenuLabel className="t-meta text-text-muted font-medium">Move to</DropdownMenuLabel>
                  {MOVABLE_STATUSES.map((status) => {
                    const blocked = isMoveBlocked(task.status, status);
                    return (
                      <DropdownMenuItem
                        key={status}
                        disabled={blocked}
                        onClick={() => onMove(task, status)}
                        className="gap-2.5 py-2 cursor-pointer"
                      >
                        {STATUS_ICON[status]}
                        <span className="font-medium text-sm">{STATUS_LABEL[status]}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {isVerifier && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={deleteMutation.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete this delegation?',
                      description: 'It is removed from the lists.',
                      confirmLabel: 'Delete',
                      variant: 'danger',
                    });
                    if (ok) deleteMutation.mutate(task.id);
                  }}
                  className="gap-2.5 py-2 cursor-pointer text-danger focus:text-danger focus:bg-danger/10"
                >
                  {deleteMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  <span className="font-medium text-sm">Delete</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {coverPhoto && (
        <img
          src={`${UPLOADS_BASE}${coverPhoto.url}`}
          alt=""
          loading="lazy"
          className="w-full aspect-[5/2] rounded-md object-cover"
        />
      )}

      {task.description && (
        <p className="text-sm sm:t-meta text-text-secondary leading-snug line-clamp-2">
          {task.description}
        </p>
      )}

      {showChecklistBar && <ChecklistProgressBar done={doneItems} total={totalItems} />}

      {flow.declined && task.declineReason && (
        <p className="rounded-lg bg-danger/10 px-2.5 py-1.5 t-meta text-danger line-clamp-2 break-words">
          <span className="font-semibold">Declined{task.decliner ? ` by ${task.decliner.firstName}` : ''}:</span> {task.declineReason}
        </p>
      )}

      {(fields.department || fields.priority || fields.category || showScoreBadge || flow.awaiting || flow.headApproved) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <TaskFlowChips task={task} />
          {fields.department && departmentName && <DepartmentChip name={departmentName} />}

          {fields.priority && priority && <PriorityChip meta={priority} />}

          {fields.category && (() => {
            const cat = CATEGORY_CONFIG[task.category];
            return <IconChip icon={cat.icon} tone={cat.solid} label={cat.label} />;
          })()}

          {showScoreBadge && <TaskScoreBadge status={task.status} />}
        </div>
      )}

      {(fields.created || fields.updated) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 t-meta font-semibold text-text-light tabular-nums">
          {fields.created && !fields.updated && (
            <span className="flex items-center gap-1" title={`Created ${formatShortDateTime(task.createdAt)}`}>
              <CalendarPlus size={12} strokeWidth={2.5} />
              {formatShortDateTime(task.createdAt)}
            </span>
          )}

          {fields.updated && (
            <span
              className="flex items-center gap-1"
              title={fields.created ? `Created ${formatShortDateTime(task.createdAt)}. Updated ${formatShortDateTime(task.updatedAt)}` : `Updated ${formatShortDateTime(task.updatedAt)}`}
            >
              <History size={12} strokeWidth={2.5} />
              {formatShortDateTime(task.updatedAt)}
            </span>
          )}
        </div>
      )}

      {((fields.raisedBy && raisedByName) || showDueCell) && (
        <div className={`grid gap-2 rounded-lg bg-surface-hover/50 px-2.5 py-2 ${((fields.raisedBy && raisedByName) && showDueCell) ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {fields.raisedBy && raisedByName && (
            <div className="min-w-0 flex flex-col gap-1">
              <span className="t-meta font-display font-medium text-text-muted">Raised by</span>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`flex items-center justify-center size-5 rounded-full text-white t-meta font-bold shrink-0 ${avatarColorClass(raisedByName)}`} aria-hidden="true">
                  {getInitials(raisedByName).slice(0, 1)}
                </span>
                <span className="text-sm font-display font-semibold text-text truncate" title={raisedByName}>{raisedByName}</span>
              </span>
            </div>
          )}
          {showDueCell && (
            <div className="min-w-0 flex flex-col gap-1">
              <span className="t-meta font-display font-medium text-text-muted">Due</span>
              <span className="flex items-center gap-1.5 min-w-0">
                <CalendarDays size={14} strokeWidth={2.25} className={`shrink-0 ${dueTone}`} aria-hidden="true" />
                <span className={`text-sm font-display font-semibold truncate ${dueTone}`} title={isOverdue ? 'Overdue' : 'Due date'}>
                  {formatShortDate(task.dueDate!)}
                </span>
                {!clockStopped && (
                  <span className={`t-meta font-display font-medium shrink-0 ${dueTone}`}>{daysLeftLabel(task.dueDate!)}</span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
        {fields.assignee ? (
          assigneeNames.length > 0 ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex items-center -space-x-1.5 shrink-0">
                {assigneeNames.slice(0, MAX_VISIBLE_AVATARS).map((name, i) => (
                  <div
                    key={name + i}
                    className={`flex items-center justify-center size-7 rounded-full text-white t-meta font-bold ring-2 ring-surface shrink-0 ${avatarColorClass(name)}`}
                    title={`Assigned to ${name}`}
                  >
                    {getInitials(name)}
                  </div>
                ))}
                {assigneeNames.length > MAX_VISIBLE_AVATARS && (
                  <div
                    className="flex items-center justify-center size-7 rounded-full bg-surface-hover text-text-secondary t-meta font-bold ring-2 ring-surface shrink-0"
                    title={assigneeNames.slice(MAX_VISIBLE_AVATARS).join(', ')}
                  >
                    +{assigneeNames.length - MAX_VISIBLE_AVATARS}
                  </div>
                )}
              </div>
              <span className="t-meta font-semibold text-text-secondary truncate">
                {assigneeNames[0]}
                {assigneeNames.length > 1 ? ` +${assigneeNames.length - 1}` : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="flex items-center justify-center size-7 rounded-full bg-surface-hover text-text-light ring-2 ring-surface shrink-0"
                title="Unassigned"
              >
                <User size={13} strokeWidth={2.5} />
              </div>
              <span className="t-meta font-semibold text-text-light truncate">Unassigned</span>
            </div>
          )
        ) : (
          <span />
        )}

        <div
          className="shrink-0"
          onPointerDown={(e) => { if (showVerifyActions) e.stopPropagation(); }}
          onClick={(e) => { if (showVerifyActions) e.stopPropagation(); }}
        >
          {showVerifyActions ? (
            <TaskVerifyActions task={task} compact finalApproval={isFinalApproval(user, task)} />
          ) : showDeclinedBadge ? (
            <StatusChip status="declined" label="Declined" />
          ) : showDoneBadge ? (
            <StatusChip status="completed" label="Done" />
          ) : showReviewBadge ? (
            <StatusChip status="in_review" label={STATUS_LABEL.pending_approval} icon={ShieldQuestion} />
          ) : null}
        </div>
      </div>
    </div>
  );
};
