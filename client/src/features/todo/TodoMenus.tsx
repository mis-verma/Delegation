import { useMemo, type ReactNode } from 'react';
import { CalendarX2, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { buildQuickDueOptions } from '../tickets/form/buildQuickDueOptions';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { dueLabel } from './todoDate';
import type { TodoPriority } from '../../api/todos';

const PRIORITIES: TodoPriority[] = ['high', 'medium', 'low'];

interface TodoDueMenuProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  children: ReactNode;
}

export const TodoDueMenu = ({ value, onChange, children }: TodoDueMenuProps) => {
  const options = useMemo(() => buildQuickDueOptions(), []);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-xl p-1.5" onClick={(e) => e.stopPropagation()}>
        {options.map(({ label, date }) => (
          <DropdownMenuItem key={label} onClick={() => onChange(date)} className="gap-2.5 py-2 cursor-pointer">
            <span className="flex-1 text-sm font-medium">{label}</span>
            <span className="t-meta text-text-muted">{dueLabel(date).split(', ')[1]}</span>
            {value?.getTime() === date.getTime() && <Check size={14} aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
        {value && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange(null)} className="gap-2.5 py-2 cursor-pointer">
              <CalendarX2 size={14} aria-hidden="true" />
              <span className="text-sm font-medium">No due date</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface TodoPriorityMenuProps {
  value: TodoPriority;
  onChange: (priority: TodoPriority) => void;
  children: ReactNode;
}

export const TodoPriorityMenu = ({ value, onChange, children }: TodoPriorityMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-40 rounded-xl p-1.5">
      {PRIORITIES.map((p) => {
        const meta = PRIORITY_MAP[p];
        const Icon = meta.icon;
        return (
          <DropdownMenuItem key={p} onClick={() => onChange(p)} className="gap-2.5 py-2 cursor-pointer">
            <span className={`flex size-5 items-center justify-center rounded-full text-white ${meta.solid}`} aria-hidden="true">
              <Icon className="size-3" strokeWidth={2.75} />
            </span>
            <span className="flex-1 text-sm font-medium">{meta.label}</span>
            {value === p && <Check size={14} aria-hidden="true" />}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  </DropdownMenu>
);
