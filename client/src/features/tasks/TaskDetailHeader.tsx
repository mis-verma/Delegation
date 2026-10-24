import { Trash2, Loader2, X, MoreHorizontal, History } from 'lucide-react';
import { SheetHeader, SheetDescription, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { TaskCodeChip } from './TaskCodeChip';
import { TaskStatusChip } from './TaskStatusChip';
import type { Task } from '../../api/task';

interface TaskDetailHeaderProps {
  task: Task;
  raisedBy?: string;
  onShowActivity: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

const ICON_BUTTON =
  'relative flex items-center justify-center size-8 sm:size-9 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 after:absolute after:-inset-1.5 sm:after:hidden';
const MENU_ITEM = 'gap-2.5 min-h-11 sm:min-h-9 t-meta font-display font-semibold cursor-pointer';

export const TaskDetailHeader = ({ task, raisedBy, onShowActivity, onDelete, isDeleting = false }: TaskDetailHeaderProps) => (
  <SheetHeader className="gap-1.5 border-b-0 pl-4 pr-2 pt-2.5 pb-1 sm:pl-6 sm:pr-4 sm:pt-3 sm:pb-1.5 lg:pl-8 lg:pr-6 text-left">
    <div className="flex items-center gap-2">
      <div className="flex flex-1 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <TaskCodeChip taskId={task.id} />
        <TaskStatusChip status={task.status} declined={!!task.declinedAt} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={isDeleting} aria-label="More actions" title="More actions" className={ICON_BUTTON}>
              {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={18} strokeWidth={2.5} />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 p-1.5 rounded-xl">
            <DropdownMenuItem onClick={onShowActivity} className={MENU_ITEM}>
              <History size={15} className="text-text-muted" />
              Activity and change log
            </DropdownMenuItem>
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className={`${MENU_ITEM} text-danger focus:text-danger`}>
                  <Trash2 size={15} className="text-danger" />
                  Delete delegation
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <SheetClose className={ICON_BUTTON}>
          <X size={18} strokeWidth={2.5} />
          <span className="sr-only">Close</span>
        </SheetClose>
      </div>
    </div>

    <SheetTitle className="sr-only">{task.title}</SheetTitle>
    <SheetDescription className="sr-only">
      {raisedBy ? `Raised by ${raisedBy}` : 'Delegation details'}
    </SheetDescription>
  </SheetHeader>
);
