import { MoveRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '../../context/AuthContext';
import { STATUS_LABEL, STATUS_ICON, MOVABLE_STATUSES } from './taskDisplay';
import { isMoveBlocked } from './taskStatusModel';
import { canMoveTask } from './taskPermissions';
import type { Task } from '../../api/task';

interface TaskMoveMenuProps {
  task: Task;
  onMove: (task: Task, status: Task['status']) => void;
}

export const TaskMoveMenu = ({ task, onMove }: TaskMoveMenuProps) => {
  const { user } = useAuth();
  if (!canMoveTask(task, user)) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Move ${task.title} to another status`}
          title="Move to another status"
          className="flex items-center justify-center size-8 rounded-md text-text-light hover:text-primary-600 hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-all duration-200 ease-in-out cursor-pointer outline-none"
        >
          <MoveRight size={15} strokeWidth={2.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs text-text-muted font-medium">Move to</DropdownMenuLabel>
        {MOVABLE_STATUSES.map((status) => (
          <DropdownMenuItem
            key={status}
            disabled={isMoveBlocked(task.status, status)}
            onClick={() => onMove(task, status)}
            className="gap-2.5 py-2 cursor-pointer"
          >
            {STATUS_ICON[status]}
            <span className="font-medium text-sm">{STATUS_LABEL[status]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
