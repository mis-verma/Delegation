import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconChip } from '../../../components/iconChip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { PRIORITY_CONFIG } from '../ticketDisplay';
import type { TicketPriority } from './formConstants';

// A form field: as tall as a select, pill corners swapped for the field radius, chevron pushed to the right edge.
const FULL_CHIP_CLASS = 'w-full h-11 sm:h-11 rounded-xl pl-2 pr-3 gap-2.5 border-border/70 [&>span:first-child]:size-6 [&>span:first-child>svg]:size-3.5';

const PRIORITY_ORDER: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Ticket priority as an icon chip that opens a small menu, same picker the delegation form uses
 *  (TaskPriorityChipPicker), with tickets' four levels. Replaces the L / M / H / C letter row. */
export const TicketPriorityChipPicker = ({
  value,
  onChange,
  fullWidth = false,
}: {
  value: TicketPriority;
  onChange: (v: TicketPriority) => void;
  /** Fill the field: chip on the left, chevron at the right edge, like a select. For forms. */
  fullWidth?: boolean;
}) => {
  const current = PRIORITY_CONFIG[value];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Priority: ${current.label}. Change priority`}
          className={cn("relative flex rounded-full cursor-pointer outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1.5 pointer-coarse:after:inset-x-0", fullWidth && "w-full rounded-xl")}
        >
          <IconChip icon={current.icon} tone={current.solid} label={current.label} className={fullWidth ? FULL_CHIP_CLASS : undefined}>
            <ChevronDown size={fullWidth ? 16 : 12} strokeWidth={2.5} className={cn("text-text-light -mr-0.5", fullWidth && "ml-auto mr-0")} />
          </IconChip>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={fullWidth ? "w-(--radix-dropdown-menu-trigger-width) min-w-40" : "w-40"}>
        {PRIORITY_ORDER.map((p) => {
          const Icon = PRIORITY_CONFIG[p].icon;
          return (
            <DropdownMenuItem key={p} onClick={() => onChange(p)} className="gap-2 min-h-11 sm:min-h-9">
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
