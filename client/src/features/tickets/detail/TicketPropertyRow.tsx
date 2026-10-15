import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketPropertyRowProps {
  label: string;
  children: ReactNode;
  /** Rail-only row: not worth a chip on a phone (the header and chips already carry the gist). */
  railOnly?: boolean;
  /** Static `max-lg:order-*` class that reorders this chip in the phone's wrapping row. Applied to
   *  the value itself because the wrapper is `display: contents` below lg. */
  chipOrderClass?: string;
  /** The rail's icon tile for this property (lg and up only; a phone shows the chip alone). */
  icon?: LucideIcon;
  /** Gradient classes for that tile. */
  tone?: string;
}

/**
 * One property of the ticket. Below lg the wrappers are `display: contents`, so each value is just a chip in
 * one wrapping row. From lg the same markup becomes a rail row: a gradient icon tile, the label small above
 * and the value under it, with the whole rail width for the value so a long department or due time is not
 * cut short. One DOM for both layouts (no hidden duplicate controls).
 */
export const TicketPropertyRow = ({ label, children, railOnly = false, chipOrderClass = '', icon: Icon, tone = 'bg-linear-to-br from-primary-500 to-primary-600' }: TicketPropertyRowProps) => (
  <div className={cn(railOnly ? 'hidden lg:flex' : 'contents lg:flex', 'lg:items-start lg:gap-3 lg:py-3 lg:first:pt-0 lg:last:pb-0')}>
    {Icon && (
      <span className={cn('hidden lg:flex size-8 shrink-0 items-center justify-center rounded-lg text-white', tone)} aria-hidden="true">
        <Icon className="size-4" strokeWidth={2.25} />
      </span>
    )}
    <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-1">
      <dt className="hidden lg:block t-meta font-medium text-text-muted">{label}</dt>
      <dd className={cn('min-w-0 flex items-center lg:flex-wrap', chipOrderClass)}>{children}</dd>
    </div>
  </div>
);
