import type { ReactNode } from 'react';

interface TicketPropertyRowProps {
  label: string;
  children: ReactNode;
  /** Rail-only row: not worth a chip on a phone (the header and chips already carry the gist). */
  railOnly?: boolean;
  /** Static `max-lg:order-*` class that reorders this chip in the phone's wrapping row. Applied to
   *  the value itself because the wrapper is `display: contents` below lg. */
  chipOrderClass?: string;
}

/**
 * One property of the ticket. Below lg the wrapper is `display: contents`, so each value is just a
 * chip in a single wrapping row. From lg the same markup becomes a labelled row in the right-hand
 * properties rail, so there is one DOM for both layouts (no hidden duplicate controls).
 */
export const TicketPropertyRow = ({ label, children, railOnly = false, chipOrderClass = '' }: TicketPropertyRowProps) => (
  <div
    className={`${railOnly ? 'hidden lg:grid' : 'contents lg:grid'} lg:grid-cols-[5.5rem_minmax(0,1fr)] lg:items-center lg:gap-3 lg:py-2.5 lg:first:pt-0 lg:last:pb-0`}
  >
    <dt className="hidden lg:block text-xs font-medium text-text-muted">{label}</dt>
    <dd className={`min-w-0 flex items-center ${chipOrderClass}`}>{children}</dd>
  </div>
);
