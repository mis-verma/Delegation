import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface TicketAttributeCardProps {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}

// Quiet, borderless-at-rest cell — same reference as the Create Ticket modal's own fields: a
// property row doesn't need its own permanent box, just a soft tint on hover/focus to show it's
// interactive. This used to nest a bordered mini-card inside the grid's own bordered wrapper,
// which is exactly the "box inside a box" heaviness the rest of the ticket UI moved away from.
const CARD_CLASS =
  'flex flex-col gap-1 p-2.5 rounded-lg transition-colors duration-150 hover:bg-surface-hover focus-within:bg-surface-hover';

const LABEL_CLASS = 'text-[10px] capitalize text-text-secondary font-semibold flex items-center gap-1';

export const TicketAttributeCard = ({ icon: Icon, label, children }: TicketAttributeCardProps) => (
  <div className={CARD_CLASS}>
    <label className={LABEL_CLASS}>
      <Icon size={11} className="text-primary-500" /> {label}
    </label>
    {children}
  </div>
);
