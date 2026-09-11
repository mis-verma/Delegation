import { MoveRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { STATUS_LABEL, STATUS_ICON, MOVABLE_STATUSES } from './taskDisplay';
import type { Task } from '../../api/task';

interface TaskMoveMenuProps {
  task: Task;
  isVerifier: boolean;
  /** Always route this through useTaskStatusMove's requestMove — never a mutation directly. */
  onMove: (task: Task, status: Task['status']) => void;
}

/**
 * The card's "Move to" menu, extracted so the table and timeline views offer the identical one.
 *
 * The board card keeps its own copy of this markup because it lives inside dnd-kit's drag
 * listeners and has to stopPropagation on pointerdown so opening the menu doesn't pick the card
 * up instead. Nothing here is draggable, so this version doesn't carry that.
 *
 * "Done" shows disabled rather than hidden for non-verifiers: the option exists, it just isn't
 * theirs to take — same rule as TaskBoard's drop handler and task.service.ts's update() guard.
 */
export const TaskMoveMenu = ({ task, isVerifier, onMove }: TaskMoveMenuProps) => (
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
          disabled={status === task.status || (status === 'done' && !isVerifier)}
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
