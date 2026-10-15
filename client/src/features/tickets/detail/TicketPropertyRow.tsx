import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketPropertyRowProps {
  label: string;
  children: ReactNode;
  /** Rail-only row: not worth a tile on a phone (the header and summary already carry the gist). */
  railOnly?: boolean;
  /** The icon tile for this property. */
  icon?: LucideIcon;
  /** Gradient classes for that tile. */
  tone?: string;
  /** A phone tile that spans the whole row (the assignee, whose picker is wide). */
  wide?: boolean;
  /** Folded away on a phone until "More details" is opened. Always shown from lg. */
  phoneHidden?: boolean;
  /** First tile on a phone (the assignee leads), without changing the rail's order. */
  first?: boolean;
}

/**
 * One property of the ticket. On a phone the properties are a tidy two-column grid of tiles (icon, small label,
 * value), so the sheet has the same steady structure whatever a ticket carries; from lg the same markup is a
 * row in the right-hand rail. One DOM for both layouts (no hidden duplicate controls).
 */
export const TicketPropertyRow = ({ label, children, railOnly = false, icon: Icon, tone = 'bg-linear-to-br from-primary-500 to-primary-600', wide = false, phoneHidden = false, first = false }: TicketPropertyRowProps) => (
  <div
    className={cn(
      railOnly ? 'hidden lg:flex' : 'flex',
      phoneHidden && 'max-lg:hidden',
      wide && 'max-lg:col-span-2',
      first && 'max-lg:order-first',
      'min-w-0 items-center gap-2.5 rounded-xl bg-surface-hover/40 px-2.5 py-2',
      'lg:items-start lg:gap-3 lg:rounded-none lg:bg-transparent lg:px-0 lg:py-3 lg:first:pt-0 lg:last:pb-0',
    )}
  >
    {Icon && (
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-white', tone)} aria-hidden="true">
        <Icon className="size-4" strokeWidth={2.25} />
      </span>
    )}
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:gap-1">
      <dt className="t-meta font-medium text-text-muted">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center">{children}</dd>
    </div>
  </div>
);
