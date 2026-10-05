import { RefreshCw, ChevronUp } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Button } from '../../../components';
import { getStatusChipMeta, type StatusChipStatus } from '../../../components/statusChip';
import type { TicketStatus } from '../../../api/ticket';

export interface TicketStatusOption {
  value: TicketStatus;
  label: string;
}

interface TicketStatusMenuProps {
  options: TicketStatusOption[];
  onPick: (status: TicketStatus) => void;
  isBusy?: boolean;
  /** `secondary` when another action (Approve / Reject) owns the footer, so there is still one
   *  primary button on screen. */
  emphasis?: 'primary' | 'secondary';
}

/**
 * The one "Update status" button in the ticket sheet's action bar. Opens upward with each status
 * as its chip's icon circle plus label; picking one opens the remark popup (the caller decides).
 * On a phone the button spans the bar and the menu matches the button's width, with 44px rows, so
 * nothing is clipped at the screen edge. From sm up it is a compact button with a 14rem menu.
 */
export const TicketStatusMenu = ({ options, onPick, isBusy = false, emphasis = 'primary' }: TicketStatusMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant={emphasis === 'primary' ? 'primary' : 'outline'}
        size="md"
        isLoading={isBusy}
        disabled={isBusy || options.length === 0}
        className={`max-sm:w-full max-sm:h-12 gap-2 font-display ${
          emphasis === 'primary' ? 'max-sm:bg-primary-700 max-sm:text-white' : ''
        }`}
      >
        {!isBusy && <RefreshCw size={15} strokeWidth={2.5} />}
        Update status
        <ChevronUp size={15} strokeWidth={2.5} className="opacity-70" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      side="top"
      align="end"
      sideOffset={8}
      collisionPadding={16}
      className="max-sm:w-(--radix-dropdown-menu-trigger-width) max-sm:min-w-0 sm:w-56 p-1.5 rounded-xl pointer-events-auto overscroll-contain"
    >
      <DropdownMenuLabel className="text-xs font-medium text-text-muted">Move to</DropdownMenuLabel>
      {options.map((opt) => {
        const meta = getStatusChipMeta(opt.value.toLowerCase() as StatusChipStatus);
        const Icon = meta.icon;
        return (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onPick(opt.value)}
            className="gap-2.5 min-h-11 sm:min-h-9 py-2 text-sm font-medium cursor-pointer"
          >
            <span className={`flex items-center justify-center size-6 rounded-full text-white shrink-0 ${meta.tone}`}>
              <Icon strokeWidth={2.75} className="size-3 text-white!" />
            </span>
            {opt.label}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  </DropdownMenu>
);
