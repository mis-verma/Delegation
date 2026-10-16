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
  /** Always a tile, at every width: for a sheet with no right-hand rail (the delegation sheet). */
  tileOnly?: boolean;
  /** Whole row on a phone, half from sm up: for a value too wide for a half-width phone tile (a select). */
  wideOnPhone?: boolean;
}

/**
 * One property of the ticket. On a phone the properties are a tidy two-column grid of tiles (icon, small label,
 * value), so the sheet has the same steady structure whatever a ticket carries; from lg the same markup is a
 * row in the right-hand rail. One DOM for both layouts (no hidden duplicate controls).
 */
export const TicketPropertyRow = ({ label, children, railOnly = false, icon: Icon, tone = 'bg-linear-to-br from-primary-500 to-primary-600', wide = false, phoneHidden = false, first = false, tileOnly = false, wideOnPhone = false }: TicketPropertyRowProps) => (
  <div
    className={cn(
      railOnly ? 'hidden lg:flex' : 'flex',
      phoneHidden && 'max-lg:hidden',
      wide && (tileOnly ? 'col-span-2' : 'max-lg:col-span-2'),
      first && 'max-lg:order-first',
      wideOnPhone && 'col-span-2 sm:col-span-1',
      'min-w-0 items-center gap-2.5 rounded-xl bg-surface-hover/40 px-2.5 py-2',
      !tileOnly && 'lg:items-start lg:gap-2.5 lg:rounded-none lg:bg-transparent lg:px-0 lg:py-2.5 lg:first:pt-0 lg:last:pb-0',
    )}
  >
    {Icon && (
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg text-white', tone)} aria-hidden="true">
        <Icon className="size-3.5" strokeWidth={2.25} />
      </span>
    )}
    <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5', !tileOnly && 'lg:gap-1')}>
      <dt className="t-meta font-medium text-text-muted leading-none">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center">{children}</dd>
    </div>
  </div>
);
