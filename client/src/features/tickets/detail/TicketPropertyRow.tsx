import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketPropertyRowProps {
  label: string;
  children: ReactNode;
  railOnly?: boolean;
  icon?: LucideIcon;
  tone?: string;
  wide?: boolean;
  phoneHidden?: boolean;
  first?: boolean;
  tileOnly?: boolean;
  wideOnPhone?: boolean;
  stackOnPhone?: boolean;
}

export const TicketPropertyRow = ({ label, children, railOnly = false, icon: Icon, tone = 'bg-linear-to-br from-primary-500 to-primary-600', wide = false, phoneHidden = false, first = false, tileOnly = false, wideOnPhone = false, stackOnPhone = false }: TicketPropertyRowProps) => (
  <div
    className={cn(
      railOnly ? 'hidden lg:flex' : 'flex',
      phoneHidden && 'max-lg:hidden',
      wide && (tileOnly ? 'col-span-2' : 'max-lg:col-span-2'),
      first && 'max-lg:order-first',
      wideOnPhone && 'col-span-2 sm:col-span-1',
      'min-w-0 items-center gap-2.5 rounded-xl bg-surface-hover/40 px-2.5 py-2',
      stackOnPhone && 'max-sm:items-stretch',
      !tileOnly && 'lg:items-start lg:gap-2.5 lg:rounded-none lg:bg-transparent lg:px-0 lg:py-2.5 lg:first:pt-0 lg:last:pb-0',
    )}
  >
    {Icon && (
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg text-white', stackOnPhone && 'max-sm:hidden', tone)} aria-hidden="true">
        <Icon className="size-3.5" strokeWidth={2.25} />
      </span>
    )}
    <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5', stackOnPhone && 'max-sm:gap-1.5', !tileOnly && 'lg:gap-1')}>
      <dt className={cn(Icon && stackOnPhone ? 'flex items-center gap-1.5 sm:sr-only' : 'sr-only')}>
        {Icon && stackOnPhone && (
          <span className={cn('sm:hidden flex size-5 shrink-0 items-center justify-center rounded-md text-white', tone)} aria-hidden="true">
            <Icon className="size-3" strokeWidth={2.5} />
          </span>
        )}
        <span className="sr-only">{label}</span>
      </dt>
      <dd className={cn('flex min-w-0 flex-wrap items-center', stackOnPhone && 'max-sm:[&>*]:w-full max-sm:[&>*]:min-w-0')}>{children}</dd>
    </div>
  </div>
);
