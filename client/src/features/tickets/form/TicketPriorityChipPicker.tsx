import { ChevronDown } from 'lucide-react';
import { IconChip } from '../../../components/iconChip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { PRIORITY_CONFIG } from '../ticketDisplay';
import type { TicketPriority } from './formConstants';

const PRIORITY_ORDER: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Ticket priority as a full-width field (current level as an icon chip, chevron at the end) that
 *  opens a small menu, same picker the delegation form uses (TaskPriorityChipPicker), with tickets'
 *  four levels. Sized like the other pickers in the routing grid: 44px tall on phones. */
export const TicketPriorityChipPicker = ({
  value,
  onChange,
  id,
}: {
  value: TicketPriority;
  onChange: (v: TicketPriority) => void;
  /** Lets a visible <label htmlFor> name this control. */
  id?: string;
}) => {
  const current = PRIORITY_CONFIG[value];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={`Priority: ${current.label}. Change priority`}
          className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface px-2.5 outline-none transition-colors cursor-pointer hover:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:h-10 [-webkit-tap-highlight-color:transparent]"
        >
          <IconChip icon={current.icon} tone={current.solid} label={current.label} className="min-w-0 border-transparent bg-transparent pr-0" />
          <ChevronDown size={14} className="shrink-0 text-text-light" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-40">
        {PRIORITY_ORDER.map((p) => {
          const Icon = PRIORITY_CONFIG[p].icon;
          return (
            <DropdownMenuItem key={p} onClick={() => onChange(p)} className="min-h-11 gap-2 sm:min-h-0">
              <span className={`flex items-center justify-center size-5 rounded-full text-white shrink-0 ${PRIORITY_CONFIG[p].solid}`}>
                <Icon strokeWidth={2.75} className="size-2.5 text-white!" />
              </span>
              {PRIORITY_CONFIG[p].label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
