import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconChip } from '../../components/iconChip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { PRIORITY_MAP } from './taskDisplay';
import type { Task } from '../../api/task';

// A form field: as tall as a select, pill corners swapped for the field radius, chevron pushed to the right edge.
const FULL_CHIP_CLASS = 'w-full h-11 sm:h-11 rounded-xl pl-2 pr-3 gap-2.5 border-border/70 [&>span:first-child]:size-6 [&>span:first-child>svg]:size-3.5';

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
  fullWidth = false,
}: {
  value: Task['priority'];
  onChange: (v: Task['priority']) => void;
  disabled?: boolean;
  /** Fill the field: chip on the left, chevron at the right edge, like a select. For forms. */
  fullWidth?: boolean;
}) => {
  const current = PRIORITY_MAP[value];
  const chip = (withChevron: boolean) => (
    <IconChip icon={current.icon} tone={current.solid} label={current.label} className={fullWidth ? FULL_CHIP_CLASS : undefined}>
      {withChevron && <ChevronDown size={fullWidth ? 16 : 12} strokeWidth={2.5} className={cn("text-text-light -mr-0.5", fullWidth && "ml-auto mr-0")} />}
    </IconChip>
  );

  if (disabled) return chip(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Priority: ${current.label}. Change priority`}
          className={cn("flex rounded-full cursor-pointer outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]", fullWidth && "w-full rounded-xl")}
        >
          {chip(true)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={fullWidth ? "w-(--radix-dropdown-menu-trigger-width) min-w-40" : "w-40"}>
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
