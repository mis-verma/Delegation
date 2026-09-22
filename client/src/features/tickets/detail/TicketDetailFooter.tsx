import { Trash2, RefreshCw, ChevronDown } from 'lucide-react';
import { Button, Dropdown, type DropdownAction } from '../../../components';
import { SheetFooter } from '@/components/ui/sheet';

interface TicketDetailFooterProps {
  isAdmin: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  // Only verifiers (PC/Admin) get the quick status-change control — everyone else already has
  // the dedicated "Update Status" panel above, which requires a remark of its own. This one now
  // requires a remark too, via a dialog TicketDetail opens for any restricted-status target —
  // see its own statusActions comment — so this button no longer needs a standing "has this
  // ticket ever had a comment" gate to justify letting a status change through unexplained.
  isVerifier: boolean;
  statusActions: DropdownAction[];
  statusLabel: string;
  statusBadgeClass: string;
}

export const TicketDetailFooter = ({
  isAdmin,
  onDelete,
  isDeleting,
  isVerifier,
  statusActions,
  statusLabel,
  statusBadgeClass,
}: TicketDetailFooterProps) => {
  // Nothing to show for a plain viewer — the sheet's own close (X) button up top already covers
  // dismissal, so this bar only needs to exist when there's an actual action to take.
  if (!isAdmin && !isVerifier) return null;

  return (
    // SheetFooter's own base classes default to a horizontal row from the `sm:` breakpoint up
    // (`sm:flex-row`) — a plain `flex-col` override here doesn't reach that variant, so on a
    // desktop-width viewport the hint paragraph below sat crammed beside the buttons instead of
    // stacking underneath. Overriding the `sm:` variant explicitly is what actually pins this to
    // a column at every width.
    <SheetFooter className="px-6 py-4 border-t border-border bg-surface/50 backdrop-blur-xl flex-col sm:flex-col items-stretch gap-2 pb-safe font-sans shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
      <div className="w-full flex items-center justify-between gap-3 flex-wrap">
        {isAdmin && (
          <Button variant="danger" size="sm" onClick={onDelete} isLoading={isDeleting}>
            <Trash2 size={16} strokeWidth={2.5} />
            Delete Ticket
          </Button>
        )}

        {isVerifier && (
          <Dropdown
            align="end"
            items={statusActions}
            trigger={
              <button
                type="button"
                title="Change status"
                className={`inline-flex items-center gap-2 text-sm font-bold px-3.5 py-2 rounded-xl border cursor-pointer transition-all ml-auto outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-95 ${statusBadgeClass}`}
              >
                <RefreshCw size={14} strokeWidth={2.5} />
                {statusLabel}
                <ChevronDown size={14} strokeWidth={2.5} className="opacity-70 ml-1" />
              </button>
            }
          />
        )}
      </div>
    </SheetFooter>
  );
};