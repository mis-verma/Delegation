import { ChevronUp, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Button } from '../../../components';
import { getStatusChipMeta, type StatusChipStatus } from '../../../components/statusChip';
import type { TicketStatus } from '../../../api/ticket';
import { HAND_IN_LABEL } from './detailConstants';

export interface TicketStatusOption {
  value: TicketStatus;
  label: string;
}

interface TicketStatusMenuProps {
  /** Every move the viewer may make from here. */
  options: TicketStatusOption[];
  current: TicketStatus;
  onPick: (status: TicketStatus) => void;
  isBusy?: boolean;
}

// The usual next step from each status, as a plain verb.
const NEXT_STEP: Partial<Record<TicketStatus, TicketStatusOption>> = {
  OPEN: { value: 'IN_PROGRESS', label: 'Start work' },
  IN_PROGRESS: { value: 'PENDING_APPROVAL', label: HAND_IN_LABEL },
  ON_HOLD: { value: 'IN_PROGRESS', label: 'Resume' },
};

/**
 * The ticket sheet's status control: the next step as one plain button ("Start work", "Mark
 * completed", "Resume") and a small More menu for every other move. With no usual next step
 * (a verifier on a closed ticket, say) the menu stands alone as "Change status".
 */
export const TicketStatusMenu = ({ options, current, onPick, isBusy = false }: TicketStatusMenuProps) => {
  const next = NEXT_STEP[current];
  const primary = next && options.some(o => o.value === next.value) ? next : null;
  const rest = options.filter(o => o.value !== primary?.value);

  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      {primary && (
        <Button
          variant="primary"
          size="md"
          isLoading={isBusy}
          disabled={isBusy}
          onClick={() => onPick(primary.value)}
          className="max-sm:flex-1 max-sm:h-11 font-display font-semibold"
        >
          {primary.label}
        </Button>
      )}
      {rest.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="md"
              disabled={isBusy}
              isLoading={!primary && isBusy}
              className={`max-sm:h-11 gap-1.5 font-display font-semibold ${primary ? 'max-sm:px-4' : 'max-sm:flex-1'}`}
            >
              {primary ? <MoreHorizontal size={16} strokeWidth={2.5} aria-hidden /> : null}
              {primary ? 'More' : 'Change status'}
              {!primary && <ChevronUp size={16} strokeWidth={2.5} className="opacity-70" aria-hidden />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            sideOffset={8}
            collisionPadding={16}
            className="w-56 p-1.5 rounded-xl pointer-events-auto overscroll-contain"
          >
            <DropdownMenuLabel className="t-meta font-medium text-text-muted">Move to</DropdownMenuLabel>
            {rest.map((opt) => {
              const meta = getStatusChipMeta(opt.value.toLowerCase() as StatusChipStatus);
              const Icon = meta.icon;
              return (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => onPick(opt.value)}
                  className="gap-2.5 min-h-11 sm:min-h-9 py-2 text-sm font-medium cursor-pointer"
                >
                  <span className={`flex items-center justify-center size-6 rounded-full text-white shrink-0 ${meta.tone}`}>
                    <Icon strokeWidth={2.5} className="size-3.5 text-white!" />
                  </span>
                  {opt.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
