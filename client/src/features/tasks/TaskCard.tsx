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
} from "lucide-react";
import { useDeleteTaskMutation } from "./hook";
import { TaskVerifyActions } from "./TaskVerifyActions";
import { PRIORITY_MAP } from "./taskDisplay";
import { isOverdueTask } from "./taskFilters";
import { TaskScoreBadge } from "./TaskScoreBadge";
import { TaskSourceBadge } from "./TaskSourceBadge";
import { coverPhotoFor } from "./taskAttachmentDisplay";
import { UPLOADS_BASE } from "../../lib/uploadsBase";
import { avatarColorClass } from "../../lib/avatarColors";
import { StatusChip } from "../../components/statusChip";
import { PriorityChip } from "../../components/priorityChip";
import { DepartmentChip } from "../../components/departmentChip";
import { IconChip } from "../../components/iconChip";
import { getInitials } from "../../lib/getInitials";
import { getChecklistProgress } from "../../lib/checklistProgress";
import { ChecklistProgressBar } from "../../components/progress";
import { CATEGORY_CONFIG, formatShortDateTime, type CardFieldVisibility } from "./cardFields";
import { STATUS_LABEL, STATUS_ICON, MOVABLE_STATUSES } from "./taskDisplay";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
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
  /** True when this task has an unread "you were just assigned this" notification — shows a small
   *  callout naming who raised it, until the card is opened. */
  isNewlyAssigned?: boolean;
  /**
   * Moves this delegation to another status. Supplied by the board, which routes it through the
   * same remark dialog a drag goes through.
   *
   * Drag is mouse-only (see TaskBoard's DraggableCard), so without this a keyboard or touch user
   * had no way to move a card from the board at all — and once the board can group by department
   * or assignee, drag stops being a status control even for mouse users. Omitted on the drag
   * overlay and anywhere the move isn't available.
   */
  onMove?: (task: Task, toStatus: Task['status']) => void;
  /**
   * Draws priority as a colored rail down the card's leading edge.
   *
   * Opt-in rather than always on: in the List view a full-width row has no priority column, so the
   * rail is what carries priority and it scans down a long stack far faster than reading a chip on
   * each row. On the board, cards are already grouped into narrow columns and can be grouped BY
   * priority, where a second priority signal on every card is noise.
   */
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
  const priority = PRIORITY_MAP[task.priority];
  const coverPhoto = coverPhotoFor(task.attachments);
  const isOverdue = isOverdueTask(task);
  const { doneItems, totalItems, progress } = getChecklistProgress(task.checklists ?? []);

  const showDoneBadge = fields.status && task.status === 'done';
  const showReviewBadge = fields.status && task.status === 'pending_approval' && !isVerifier;
  const showVerifyActions = task.status === 'pending_approval' && isVerifier;

  const showChecklistBar = fields.subtasks && progress !== null;
  // A single due/overdue IconChip in the main chip row now — same pill Ticket and Checklist cards
  // already use for their own due date. This used to be two different-looking treatments
  // (a bespoke gradient progress bar mid-card, a StatusChip pill in the footer) that were also
  // mutually exclusive for no reason a viewer could see, and disagreed with each other's wording
  // ("3d left" vs "3 days left") whenever both could have applied.
  const showDueChip = fields.dueDate && !!task.dueDate && task.status !== 'done';
  // The footer shows Done / In review / verify actions for these states, so the score pill would
  // just be a second reading of the same status.
  const showScoreBadge = fields.status && task.status !== 'done' && task.status !== 'pending_approval';

  return (
    <div
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(task);
        }
      }}
      role="button"
      tabIndex={0}
      className={`group relative flex flex-col gap-2 p-3.5 rounded-lg border border-border bg-surface hover:border-primary-500/40 transition-colors duration-200 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 overflow-hidden ${priorityRail ? 'pl-4' : ''}`}
    >
      {/* Absolutely positioned so it hugs the rounded edge without becoming a flex child that
          every other row in the card has to lay out around. aria-hidden because the priority is
          already announced by the chip in the card's own footer. */}
      {priorityRail && (
        <span
          aria-hidden
          className={`absolute left-0 top-0 bottom-0 w-1 ${priority.stripe}`}
        />
      )}

      {isNewlyAssigned && raisedByName && (
        <div className="flex items-center gap-1.5 -mt-1 -mx-1 px-2.5 py-1.5 rounded-lg bg-info/10 text-[11px] font-semibold text-info">
          <UserCog size={12} strokeWidth={2.5} className="shrink-0" />
          <span className="truncate">New delegation from {raisedByName} — kindly review</span>
        </div>
      )}

      {/* Title gets the card's full width. Move/Delete used to sit beside it and squeezed a
          ~250px column's title down to "Security camera offlin…"; they're a small floating
          toolbar now, shown on hover or keyboard focus (always on touch, where there's no hover). */}
      <div className="flex items-start gap-2">
        <h4 className={`flex-1 min-w-0 text-sm font-display font-semibold text-text tracking-tight leading-snug line-clamp-2 break-words ${onMove || isVerifier ? 'pointer-coarse:pr-20' : ''}`}>
          {task.title}
        </h4>
        <TaskSourceBadge aiMeta={task.aiMeta} />
      </div>

      {(onMove || isVerifier) && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 p-0.5 rounded-lg border border-border/70 bg-surface opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-150">

          {onMove && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  // Same reason as the delete button below: this sits inside dnd-kit's drag
                  // listeners, so its press must not pick the card up instead.
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Move to another status"
                  title="Move to another status"
                  className="flex items-center justify-center size-8 rounded-md text-text-muted hover:text-primary-600 hover:bg-primary-500/10 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <MoveRight size={15} strokeWidth={2.5} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 rounded-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuLabel className="text-xs text-text-muted font-medium">Move to</DropdownMenuLabel>
                {MOVABLE_STATUSES.map((status) => {
                  // "Done" is reached through the verification flow (Approve) only, for anyone —
                  // same rule useTaskStatusMove enforces on a drop and task.service.ts on the
                  // server. "Pending Approval" must arrive from "In Progress" — skipping straight
                  // there from To Do used to be allowed. Showing both disabled says the option
                  // exists but isn't available from here/now, rather than hiding it outright.
                  const blocked = status === 'done' || (status === 'pending_approval' && task.status !== 'in_progress');
                  return (
                    <DropdownMenuItem
                      key={status}
                      disabled={status === task.status || blocked}
                      onClick={() => onMove(task, status)}
                      className="gap-2.5 py-2 cursor-pointer"
                    >
                      {STATUS_ICON[status]}
                      <span className="font-medium text-sm">{STATUS_LABEL[status]}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isVerifier && (
            <button
              type="button"
              // On the board this card sits inside dnd-kit's drag listeners. Without stopping the
              // pointerdown here, pressing Delete and moving a few pixels picks the whole card up
              // instead of pressing the button — the click never lands.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                deleteMutation.mutate(task.id);
              }}
              disabled={deleteMutation.isPending}
              aria-label="Delete delegation"
              title="Delete delegation"
              className="flex items-center justify-center size-8 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            >
              {deleteMutation.isPending ? (
                <Loader2 size={15} strokeWidth={2.5} className="animate-spin text-danger" />
              ) : (
                <Trash2 size={15} strokeWidth={2.5} />
              )}
            </button>
          )}
        </div>
      )}

      {coverPhoto && (
        // aspect-video gave a ~250px-wide column a ~140px image — the single heaviest thing on the
        // card and the least informative. 5:2 keeps it recognisable at roughly two-thirds the height.
        <img
          src={`${UPLOADS_BASE}${coverPhoto.url}`}
          alt=""
          loading="lazy"
          className="w-full aspect-[5/2] rounded-md object-cover"
        />
      )}

      {task.description && (
        <p className="text-xs text-text-secondary leading-tight line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Checklist completion, governed by the "Subtasks" field toggle. Same shared component
          Tickets use, so the two card types read identically. */}
      {showChecklistBar && <ChecklistProgressBar done={doneItems} total={totalItems} />}

      {/* One pill row: department, priority, category, due date and the score badge all read as
          the same kind of thing now, matching Ticket/Checklist cards' own chip row. The score
          badge is suppressed whenever the footer already carries a status badge for the same fact
          — otherwise a finished delegation showed "Mark 100%" here and "Done" three lines below it. */}
      {(fields.department || fields.priority || fields.category || showDueChip || showScoreBadge) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {fields.department && departmentName && <DepartmentChip name={departmentName} />}

          {fields.priority && priority && <PriorityChip meta={priority} />}

          {fields.category && (() => {
            const cat = CATEGORY_CONFIG[task.category];
            return <IconChip icon={cat.icon} tone={cat.solid} label={cat.label} />;
          })()}

          {showDueChip && (
            <IconChip
              icon={CalendarDays}
              tone={isOverdue ? 'bg-danger' : 'bg-primary-700'}
              label={daysLeftLabel(task.dueDate!)}
              title={isOverdue ? 'Overdue' : 'Due date'}
              className={isOverdue ? 'border-danger/30 text-danger' : undefined}
            />
          )}

          {showScoreBadge && <TaskScoreBadge status={task.status} />}
        </div>
      )}

      {/* Raised-by and the timestamps were three separate bands. They're all the same kind of thing
          — quiet text metadata — so they share one wrapping row, which keeps pills and plain text
          from alternating down the card. */}
      {((fields.raisedBy && raisedByName) || fields.created || fields.updated) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-text-light tabular-nums">
          {fields.raisedBy && raisedByName && (
            <span className="flex items-center gap-1 min-w-0">
              <UserCog size={12} strokeWidth={2.5} className="shrink-0" />
              <span className="truncate text-text-muted">{raisedByName}</span>
            </span>
          )}

          {fields.created && (
            <span className="flex items-center gap-1" title={`Created ${formatShortDateTime(task.createdAt)}`}>
              <CalendarPlus size={12} strokeWidth={2.5} />
              {formatShortDateTime(task.createdAt)}
            </span>
          )}

          {fields.updated && (
            <span className="flex items-center gap-1" title={`Updated ${formatShortDateTime(task.updatedAt)}`}>
              <History size={12} strokeWidth={2.5} />
              {formatShortDateTime(task.updatedAt)}
            </span>
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
                    className={`flex items-center justify-center size-6 rounded-full text-white text-[10px] font-bold ring-2 ring-surface shrink-0 ${avatarColorClass(name)}`}
                    title={`Assigned to ${name}`}
                  >
                    {getInitials(name)}
                  </div>
                ))}
                {assigneeNames.length > MAX_VISIBLE_AVATARS && (
                  <div
                    className="flex items-center justify-center size-6 rounded-full bg-surface-hover text-text-secondary text-[10px] font-bold ring-2 ring-surface shrink-0"
                    title={assigneeNames.slice(MAX_VISIBLE_AVATARS).join(', ')}
                  >
                    +{assigneeNames.length - MAX_VISIBLE_AVATARS}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-semibold text-text-secondary truncate">
                {assigneeNames[0]}
                {assigneeNames.length > 1 ? ` +${assigneeNames.length - 1}` : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="flex items-center justify-center size-6 rounded-full bg-surface-hover text-text-light ring-2 ring-surface shrink-0"
                title="Unassigned"
              >
                <User size={13} strokeWidth={2.5} />
              </div>
              <span className="text-[11px] font-semibold text-text-light truncate">Unassigned</span>
            </div>
          )
        ) : (
          <span />
        )}

        {/* Same reason as the delete button above: Approve/Reject are real controls sitting inside
            the card's drag surface, so their presses must not start a drag or bubble up to the
            card's own "open detail" click. */}
        <div
          className="shrink-0"
          onPointerDown={(e) => { if (showVerifyActions) e.stopPropagation(); }}
          onClick={(e) => { if (showVerifyActions) e.stopPropagation(); }}
        >
          {showVerifyActions ? (
            <TaskVerifyActions task={task} compact />
          ) : showDoneBadge ? (
            <StatusChip status="completed" label="Done" />
          ) : showReviewBadge ? (
            <StatusChip status="in_review" label="In review" icon={ShieldQuestion} />
          ) : null}
        </div>
      </div>
    </div>
  );
};
