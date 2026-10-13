import { ChevronDown, ChevronUp } from 'lucide-react';
import { Switch } from '../../components';
import { CARD_LABEL, type DashboardCardId } from './dashboardLayout';

interface DashboardMobileCustomizeProps {
  /** Every card this screen can show, in the saved order, hidden ones included. */
  order: DashboardCardId[];
  hidden: DashboardCardId[];
  /** Moves a card to where another one sits (the neighbour it swaps with). */
  onMove: (activeId: DashboardCardId, overId: DashboardCardId) => void;
  onToggle: (id: DashboardCardId) => void;
}

const ARROW_CLASS =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition-colors outline-none hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-40 disabled:hover:bg-surface cursor-pointer disabled:cursor-not-allowed';

/**
 * Customize on a phone: a plain list with Up and Down buttons and a switch per card. Dragging a card
 * across a scrolling phone page is fiddly and easy to trigger by accident, so a phone gets buttons that
 * are 44px and 8px apart instead. The drag grid stays for larger screens.
 */
export const DashboardMobileCustomize = ({ order, hidden, onMove, onToggle }: DashboardMobileCustomizeProps) => (
  <ul className="flex flex-col gap-2" aria-label="Dashboard cards">
    {order.map((id, index) => {
      const label = CARD_LABEL[id];
      const isHidden = hidden.includes(id);
      const above = order[index - 1];
      const below = order[index + 1];
      return (
        <li key={id} className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2">
          <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 pl-1">
            <span className={`min-w-0 break-words t-card font-display font-semibold ${isHidden ? 'text-text-muted' : 'text-text'}`}>{label}</span>
            <Switch checked={!isHidden} onChange={() => onToggle(id)} />
          </label>
          <button type="button" className={ARROW_CLASS} disabled={!above} onClick={() => above && onMove(id, above)} aria-label={`Move ${label} up`}>
            <ChevronUp className="size-5" aria-hidden="true" />
          </button>
          <button type="button" className={ARROW_CLASS} disabled={!below} onClick={() => below && onMove(id, below)} aria-label={`Move ${label} down`}>
            <ChevronDown className="size-5" aria-hidden="true" />
          </button>
        </li>
      );
    })}
  </ul>
);
