import { ChevronDown } from 'lucide-react';
import { IconChip } from '../../../components/iconChip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { PRIORITY_CONFIG } from '../ticketDisplay';
import type { TicketPriority } from './formConstants';

const PRIORITY_ORDER: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Ticket priority as an icon chip that opens a small menu, same picker the delegation form uses
 *  (TaskPriorityChipPicker), with tickets' four levels. Replaces the L / M / H / C letter row. */
export const TicketPriorityChipPicker = ({
  value,
  onChange,
}: {
  value: TicketPriority;
  onChange: (v: TicketPriority) => void;
}) => {
  const current = PRIORITY_CONFIG[value];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Priority: ${current.label}. Change priority`}
          className="flex rounded-full cursor-pointer outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
        >
          <IconChip icon={current.icon} tone={current.solid} label={current.label}>
            <ChevronDown size={12} strokeWidth={2.5} className="text-text-light -mr-0.5" />
          </IconChip>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {PRIORITY_ORDER.map((p) => {
          const Icon = PRIORITY_CONFIG[p].icon;
          return (
            <DropdownMenuItem key={p} onClick={() => onChange(p)} className="gap-2">
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
