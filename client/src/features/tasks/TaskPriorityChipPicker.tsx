import { ChevronDown } from 'lucide-react';
import { IconChip } from '../../components/iconChip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { PRIORITY_MAP } from './taskDisplay';
import type { Task } from '../../api/task';

const PRIORITY_ORDER: Task['priority'][] = ['low', 'medium', 'high'];

/**
 * Priority as an icon chip (arrow on its solid tone, same IconChip the list cards use) that opens
 * a small menu to change it. Shared by the delegation detail sheet and the New Delegation form so
 * both show and pick priority the same way. `disabled` renders the plain chip.
 */
export const TaskPriorityChipPicker = ({
  value,
  onChange,
  disabled = false,
}: {
  value: Task['priority'];
  onChange: (v: Task['priority']) => void;
  disabled?: boolean;
}) => {
  const current = PRIORITY_MAP[value];
  const chip = (withChevron: boolean) => (
    <IconChip icon={current.icon} tone={current.solid} label={current.label}>
      {withChevron && <ChevronDown size={12} strokeWidth={2.5} className="text-text-light -mr-0.5" />}
    </IconChip>
  );

  if (disabled) return chip(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Priority: ${current.label}. Change priority`}
          className="flex rounded-full cursor-pointer outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
        >
          {chip(true)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {PRIORITY_ORDER.map((p) => {
          const Icon = PRIORITY_MAP[p].icon;
          return (
            <DropdownMenuItem key={p} onClick={() => onChange(p)} className="gap-2">
              <span className={`flex items-center justify-center size-5 rounded-full text-white shrink-0 ${PRIORITY_MAP[p].solid}`}>
                <Icon strokeWidth={2.75} className="size-2.5 text-white!" />
              </span>
              {PRIORITY_MAP[p].label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
