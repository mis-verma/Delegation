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
}

/**
 * The one "Update status" button at the bottom of the ticket sheet. Opens upward with each
 * status as its chip's icon circle plus label; picking one opens the remark popup (the caller
 * decides). Replaces both the old verifier-only colored dropdown and the always-open "Update
 * Status" panel (three buttons, a textarea and photo buttons pinned over half a phone screen).
 * Full width and navy on phones, like the delegation sheet's Advance button.
 */
export const TicketStatusMenu = ({ options, onPick, isBusy = false }: TicketStatusMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="primary"
        size="sm"
        isLoading={isBusy}
        disabled={isBusy || options.length === 0}
        className="max-sm:flex-1 max-sm:h-11 max-sm:bg-primary-700 max-sm:text-white gap-2 font-display"
      >
        {!isBusy && <RefreshCw size={15} strokeWidth={2.5} />}
        Update status
        <ChevronUp size={15} strokeWidth={2.5} className="opacity-70" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-56 p-1.5 rounded-xl">
      <DropdownMenuLabel className="text-xs font-medium text-text-muted">Move to</DropdownMenuLabel>
      {options.map((opt) => {
        const meta = getStatusChipMeta(opt.value.toLowerCase() as StatusChipStatus);
        const Icon = meta.icon;
        return (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onPick(opt.value)}
            className="gap-2.5 py-2 text-sm font-medium cursor-pointer"
          >
            <span className={`flex items-center justify-center size-6 rounded-full text-white shrink-0 ${meta.tone}`}>
              <Icon size={12} strokeWidth={2.75} />
            </span>
            {opt.label}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  </DropdownMenu>
);
