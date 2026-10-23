import { useState } from 'react';
import { Trash2, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useDeleteTaskChecklistMutation } from './hook';
import type { TaskChecklist } from '../../api/taskChecklist';
import { ChecklistItemRow } from './ChecklistItemRow';
import { useConfirm } from '../../components';

export const ChecklistBlock = ({
  checklist, taskId, isAdmin, currentUserId, workerIds = [],
}: {
  checklist:      TaskChecklist;
  taskId:         string;
  isAdmin:        boolean;
  currentUserId?: string;
  workerIds?: string[];
}) => {
  const [open, setOpen] = useState(true);
  const deleteChecklist = useDeleteTaskChecklistMutation(taskId);
  const confirm = useConfirm();
  const askDelete = async () => {
    const ok = await confirm({
      title: 'Delete this checklist?',
      description: 'Its items and any photos on them will be removed.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) deleteChecklist.mutate(checklist.id);
  };
  const doneCount = checklist.items.filter(i => i.isDone).length;
  const progress = checklist.items.length ? (doneCount / checklist.items.length) * 100 : 0;
  const isComplete = progress === 100;

  const toggle = () => setOpen(v => !v);
  const onToggleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div className={`rounded-xl border transition-colors duration-200 overflow-hidden ${
      isComplete ? 'bg-surface-hover/40 border-border/60' : 'bg-surface border-border'
    }`}>
      <div
        className={`group flex items-center justify-between gap-3 px-3 sm:px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-surface-hover/60 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-inset ${open ? 'border-b border-border/60' : ''}`}
        onClick={toggle}
        onKeyDown={onToggleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="p-1 rounded-md bg-surface border border-border text-text-muted group-hover:text-text-secondary group-hover:border-border-hover transition-colors shrink-0">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className={`text-sm font-display font-semibold line-clamp-2 break-words leading-snug transition-colors ${
              isComplete ? 'text-text-muted' : 'text-text'
            }`}>
              {checklist.title}
            </h4>
            <div className="flex items-center gap-2.5 mt-1 max-w-[240px]">
              <div className="h-1.5 flex-1 bg-surface-hover rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    isComplete ? 'bg-primary-500' : 'bg-info'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={`t-meta font-bold min-w-8 shrink-0 ${
                isComplete ? 'text-primary-600' : 'text-text-muted'
              }`}>
                {doneCount}/{checklist.items.length}
              </span>
            </div>
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void askDelete(); }}
            disabled={deleteChecklist.isPending}
            className="flex items-center justify-center size-8 pointer-coarse:size-10 text-text-light hover:text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
            title="Delete checklist"
            aria-label="Delete checklist"
          >
            {deleteChecklist.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </button>
        )}
      </div>

      <div
        className={`transition-all duration-300 ease-in-out ${open ? 'opacity-100 max-h-[5000px]' : 'opacity-0 max-h-0 overflow-hidden'}`}
      >
        <div className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 bg-surface-hover/30">
          {checklist.items.length === 0 && (
            <div className="p-6 sm:p-8 text-center text-sm font-medium text-text-muted bg-surface rounded-xl border border-border">
              No items in this checklist yet.
            </div>
          )}
          {checklist.items.map(item => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              taskId={taskId}
              isAdmin={isAdmin}
              canWork={isAdmin || (!!currentUserId && (item.assigneeId ? item.assigneeId === currentUserId : workerIds.includes(currentUserId)))}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
