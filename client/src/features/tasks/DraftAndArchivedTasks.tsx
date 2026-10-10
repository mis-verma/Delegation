import { useMemo, useState } from 'react';
import { Navigate } from 'react-router';
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
  PauseCircle,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EntityIconTile, Skeleton, EmptyState, IconChip, PriorityChip, DepartmentChip, InlineError, Button, useConfirm } from '../../components';
import { Badge } from '../../components/ui/badge';
import { useDraftTasksQuery, useArchivedTasksQuery, usePublishDraftTaskMutation, useRestoreTaskMutation, useDiscardDraftMutation } from './hook';
import { draftPublishProblem } from './taskStatusModel';
import { useDepartmentsQuery } from '../tickets/hook';
import { useAuth } from '../../context/AuthContext';
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
  on_hold: { tone: 'bg-warning', icon: PauseCircle },
};

const RowSkeleton = () => (
  <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border/60 bg-surface">
    <Skeleton className="h-4 w-1/3" />
    <Skeleton className="h-4 w-16 ml-auto" />
    <Skeleton className="h-8 w-24 rounded-lg" />
  </div>
);

const PageHeader = ({ icon, tone, title, description, count }: { icon: typeof FileEdit; tone: 'primary' | 'coral'; title: string; description: string; count: number }) => (
  <header className="flex items-center gap-3">
    <EntityIconTile icon={icon} tone={tone} className="size-10 sm:size-12 rounded-xl sm:rounded-2xl" />
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="flex items-center gap-2">
        <h1 className="t-section font-display font-bold text-text">{title}</h1>
        <Badge variant="neutral" className="min-w-5 justify-center tabular-nums">
          {count}
        </Badge>
      </div>
      <p className="hidden sm:block t-meta font-display text-text-muted">{description}</p>
    </div>
  </header>
);

const RowShell = ({ task, departmentNames, action, problem }: { task: Task; departmentNames: Map<string, string>; action: React.ReactNode; problem?: string | null }) => {
  const priority = PRIORITY_MAP[task.priority];
  const status = STATUS_CHIP_META[task.status];
  const category = CATEGORY_CONFIG[task.category];
  const department = task.departmentId ? departmentNames.get(task.departmentId) : undefined;

  return (
    <div className="flex flex-col gap-2 px-4 py-3.5 rounded-xl border border-border/60 bg-surface hover:border-border-hover transition-colors duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <p className="t-card font-display font-semibold text-text leading-snug line-clamp-2 break-words">{task.title}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <IconChip icon={status.icon} tone={status.tone} label={STATUS_LABEL[task.status]} />
            <PriorityChip meta={priority} />
            {task.category !== 'delegation' && <IconChip icon={category.icon} tone={category.solid} label={category.label} />}
            {department && <DepartmentChip name={department} />}
            <span className="inline-flex items-center gap-1 t-meta font-display font-medium text-text-muted">
              <Clock3 size={12} className="shrink-0" aria-hidden />
              {formatShortDate(task.updatedAt)}
            </span>
          </div>
        </div>
        <div className="shrink-0 sm:self-center">{action}</div>
      </div>
      {problem && <p role="alert" className="t-meta font-display font-medium text-danger">{problem}</p>}
    </div>
  );
};

/**
 * Draft Delegations: pre-publication scratch items, visible only to whoever created them (see
 * task.service.ts#list). "Publish" fires the same status-change PATCH (draft -> todo) the detail
 * sheet's Publish does, with the same fixed note and the same check for what is still missing.
 * Opening the row goes through TaskDetail for anyone who wants to finish filling it out first. The
 * creator can also discard a draft (the server allows DELETE of your own draft).
 */
export const DraftDelegationsPage = () => {
  const { data: tasks, isPending, isError, refetch } = useDraftTasksQuery();
  const { data: departments } = useDepartmentsQuery();
  const publishMutation = usePublishDraftTaskMutation();
  const discardMutation = useDiscardDraftMutation();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Task | null>(null);
  // What a row still lacks, said under that row after a Publish tap.
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null);
  const departmentNames = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments]);

  const publish = (task: Task) => {
    const missing = draftPublishProblem(task);
    if (missing) {
      setProblem({ id: task.id, text: missing });
      return;
    }
    setProblem(null);
    publishMutation.mutate(task.id);
  };

  const discard = async (task: Task) => {
    const ok = await confirm({
      title: 'Discard this draft?',
      description: 'It was never published, so nobody else has seen it.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) discardMutation.mutate(task.id);
  };

  return (
    <div className="flex flex-col gap-6 pt-2.5 max-w-4xl mx-auto w-full">
      <PageHeader icon={FileEdit} tone="primary" title="Draft delegations" description="Saved but not published yet. Only you can see these." count={tasks?.length ?? 0} />

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <InlineError message="We couldn't load your drafts. Check your connection and try again." onRetry={() => void refetch()} />
      ) : !tasks?.length ? (
        <EmptyState icon={Inbox} title="No drafts" description="Tap Save as draft on the New delegation form and it waits here until you publish it." />
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <RowShell
              key={task.id}
              task={task}
              departmentNames={departmentNames}
              problem={problem?.id === task.id ? problem.text : null}
              action={
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => void discard(task)} disabled={discardMutation.isPending} className="font-display">
                    <Trash2 size={13} strokeWidth={2.5} />
                    Discard
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelected(task)} className="font-display">
                    <Pencil size={13} strokeWidth={2.5} />
                    Edit
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => publish(task)} disabled={publishMutation.isPending} className="font-display">
                    <ArrowUpRight size={13} strokeWidth={2.5} />
                    Publish
                  </Button>
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
 *
 * Admin and PC only: they are the only roles the server lets delete or restore a delegation, so for
 * anyone else this page would be a list with a button that always fails. A typed-in link goes back
 * to Delegation instead.
 */
export const ArchivedDelegationsPage = () => {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== 'ADMIN' && user.role !== 'PC') return <Navigate to="/tasks" replace />;
  return <ArchivedDelegationsList />;
};

const ArchivedDelegationsList = () => {
  const { data: tasks, isPending, isError, refetch } = useArchivedTasksQuery();
  const { data: departments } = useDepartmentsQuery();
  const restoreMutation = useRestoreTaskMutation();
  const departmentNames = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments]);

  return (
    <div className="flex flex-col gap-6 pt-2.5 max-w-4xl mx-auto w-full">
      <PageHeader icon={Archive} tone="coral" title="Archived" description="Deleted delegations, kept around in case they need to come back." count={tasks?.length ?? 0} />

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <InlineError message="We couldn't load the archive. Check your connection and try again." onRetry={() => void refetch()} />
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
                <Button variant="outline" size="sm" onClick={() => restoreMutation.mutate(task.id)} disabled={restoreMutation.isPending} className="font-display">
                  <RotateCcw size={13} strokeWidth={2.5} />
                  Restore
                </Button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};
