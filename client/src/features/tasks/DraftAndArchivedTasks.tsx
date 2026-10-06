import { useMemo, useState } from 'react';
import {
  FileEdit,
  Archive,
  ArrowUpRight,
  RotateCcw,
  Inbox,
  Pencil,
  Clock3,
  CircleDashed,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EntityIconTile, Skeleton, EmptyState, IconChip, PriorityChip } from '../../components';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { useDraftTasksQuery, useArchivedTasksQuery, usePublishDraftTaskMutation, useRestoreTaskMutation } from './hook';
import { useDepartmentsQuery } from '../tickets/hook';
import { TaskDetail } from './TaskDetail';
import { PRIORITY_MAP, STATUS_LABEL } from './taskDisplay';
import { CATEGORY_CONFIG, formatShortDate } from './cardFields';
import type { Task } from '../../api/task';

// A local status→{tone, icon} table rather than reusing taskDisplay's own STATUS_ICON/STATUS_CONFIG
// (JSX elements and badge classes, not the {tone, icon} shape IconChip wants) — those two feed a
// dozen other call sites (TaskCard, TaskMoveMenu, TaskDetail's dropdown) that render status their
// own established way, so this stays scoped to these two chip-based rows instead of reshaping a
// widely-shared map. Same solid `bg-status-*` tokens the rest of the app already uses for these
// statuses (TodoList's dot classes, the dashboard's activity colors), so the color still matches.
const STATUS_CHIP_META: Record<Task['status'], { tone: string; icon: LucideIcon }> = {
  draft: { tone: 'bg-text-light', icon: FileEdit },
  todo: { tone: 'bg-status-todo', icon: CircleDashed },
  in_progress: { tone: 'bg-status-progress', icon: Clock },
  pending_approval: { tone: 'bg-status-approve', icon: ShieldCheck },
  done: { tone: 'bg-status-done', icon: CheckCircle2 },
};

const RowSkeleton = () => (
  <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border/60 bg-surface">
    <Skeleton className="h-4 w-1/3" />
    <Skeleton className="h-4 w-16 ml-auto" />
    <Skeleton className="h-8 w-24 rounded-lg" />
  </div>
);

const PageHeader = ({ icon, tone, title, description, count }: { icon: typeof FileEdit; tone: 'primary' | 'coral'; title: string; description: string; count: number }) => (
  <header className="flex items-center gap-4 pb-6 border-b border-border">
    <EntityIconTile icon={icon} tone={tone} className="size-12 rounded-2xl" />
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-display font-bold text-text tracking-tight">{title}</h1>
        <Badge variant="neutral" className="min-w-5 justify-center tabular-nums">
          {count}
        </Badge>
      </div>
      <p className="text-sm font-display text-text-muted mt-0.5">{description}</p>
    </div>
  </header>
);

const RowShell = ({ task, departmentNames, action }: { task: Task; departmentNames: Map<string, string>; action: React.ReactNode }) => {
  const priority = PRIORITY_MAP[task.priority];
  const status = STATUS_CHIP_META[task.status];
  const category = CATEGORY_CONFIG[task.category];
  const department = task.departmentId ? departmentNames.get(task.departmentId) : undefined;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 rounded-xl border border-border/60 bg-surface hover:border-border-hover transition-colors duration-200">
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <p className="text-sm font-display font-semibold text-text truncate">{task.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <IconChip icon={status.icon} tone={status.tone} label={STATUS_LABEL[task.status]} />
          <PriorityChip meta={priority} />
          <IconChip icon={category.icon} tone={category.solid} label={category.label} />
          {department && <IconChip icon={Building2} tone="bg-primary-700" label={department} />}
          <span className="inline-flex items-center gap-1 text-xs font-display font-medium text-text-muted">
            <Clock3 size={11} className="shrink-0" />
            {formatShortDate(task.updatedAt)}
          </span>
        </div>
      </div>
      <div className="shrink-0 self-start sm:self-center">{action}</div>
    </div>
  );
};

const ACTION_BUTTON_CLASS = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-surface-hover/50 text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:border-border transition-all duration-200 ease-in-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Draft Delegations — pre-publication scratch items, visible only to whoever created them (see
 * task.service.ts#list). "Publish" is a one-click shortcut that fires the same status-change PATCH
 * (draft -> todo) TaskDetail's own "Advance" button would, just with a fixed remark instead of
 * prompting for one — opening the row goes through TaskDetail itself for anyone who wants to
 * finish filling the delegation out (assignee, due date, etc.) before publishing it for real.
 */
export const DraftDelegationsPage = () => {
  const { data: tasks, isPending } = useDraftTasksQuery();
  const { data: departments } = useDepartmentsQuery();
  const publishMutation = usePublishDraftTaskMutation();
  const [selected, setSelected] = useState<Task | null>(null);
  const departmentNames = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <PageHeader icon={FileEdit} tone="primary" title="Draft Delegations" description="Saved but not yet published — only you can see these." count={tasks?.length ?? 0} />

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={i} />)}
        </div>
      ) : !tasks?.length ? (
        <EmptyState icon={Inbox} title="No drafts" description="Delegations saved as a draft from the create form show up here until you publish them." />
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <RowShell
              key={task.id}
              task={task}
              departmentNames={departmentNames}
              action={
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSelected(task)} className={ACTION_BUTTON_CLASS}>
                    <Pencil size={13} strokeWidth={2.5} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => publishMutation.mutate(task.id)}
                    disabled={publishMutation.isPending}
                    // Plain string interpolation left the base class's bg/border/text utilities
                    // (bg-surface-hover/50, border-border/60, text-text-secondary) and these
                    // overrides both in the className — which one wins is decided by Tailwind's
                    // generated CSS order, not by position in the string, so the button rendered
                    // with whichever set happened to come out on top instead of the solid navy
                    // it was meant to have. cn() (clsx + tailwind-merge, same helper every other
                    // component in this app already uses for this exact situation) resolves the
                    // conflicting utilities deterministically, override always wins.
                    className={cn(ACTION_BUTTON_CLASS, 'bg-primary-700 hover:bg-primary-800 border-primary-700 text-white hover:border-primary-800')}
                  >
                    <ArrowUpRight size={13} strokeWidth={2.5} />
                    Publish
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}

      {selected && <TaskDetail task={selected} onClose={() => setSelected(null)} initialMode="edit" />}
    </div>
  );
};

/**
 * Archived Delegations — soft-deleted tasks (Task.deletedAt), same visibility scope the live list
 * uses. Read-only rows, not click-through to TaskDetail: the detail endpoint excludes soft-deleted
 * rows everywhere (same NOT_DELETED guard the rest of the app relies on), so there's no detail view
 * to open here — Restore is the one real action, and it's what brings the row back into that view.
 */
export const ArchivedDelegationsPage = () => {
  const { data: tasks, isPending } = useArchivedTasksQuery();
  const { data: departments } = useDepartmentsQuery();
  const restoreMutation = useRestoreTaskMutation();
  const departmentNames = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <PageHeader icon={Archive} tone="coral" title="Archived" description="Deleted delegations, kept around in case they need to come back." count={tasks?.length ?? 0} />

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={i} />)}
        </div>
      ) : !tasks?.length ? (
        <EmptyState icon={Archive} title="Nothing archived" description="Delegations that get deleted land here instead of disappearing outright, so they can be restored later." />
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <RowShell
              key={task.id}
              task={task}
              departmentNames={departmentNames}
              action={
                <button
                  type="button"
                  onClick={() => restoreMutation.mutate(task.id)}
                  disabled={restoreMutation.isPending}
                  className={ACTION_BUTTON_CLASS}
                >
                  <RotateCcw size={13} strokeWidth={2.5} />
                  Restore
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};
