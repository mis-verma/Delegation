import { Fragment, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
import { PickerShell } from '../dateTime/PickerShell';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { haptic } from '../../lib/haptics';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DropdownAction {
  label: string;
  to?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  variant?: 'default' | 'destructive';
  separatorBefore?: boolean;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownAction[];
  align?: 'start' | 'center' | 'end';
  title?: string;
}

const PhoneRow = ({ item, onDone }: { item: DropdownAction; onDone: () => void }) => {
  const Icon = item.icon;
  const destructive = item.variant === 'destructive';
  const rowClass = cn(
    'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-display font-semibold outline-none transition-colors duration-150 cursor-pointer active:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40',
    destructive ? 'text-danger active:bg-danger/10' : 'text-text',
  );
  const icon = Icon ? <Icon size={18} strokeWidth={2.25} className={destructive ? 'text-danger' : 'text-text-muted'} aria-hidden="true" /> : null;
  if (item.to) {
    return (
      <NavLink to={item.to} onClick={() => { haptic('tap'); onDone(); }} className={rowClass}>
        {icon}
        {item.label}
      </NavLink>
    );
  }
  return (
    <button type="button" onClick={() => { haptic('tap'); onDone(); item.onClick?.(); }} className={rowClass}>
      {icon}
      {item.label}
    </button>
  );
};

export const Dropdown = ({ trigger, items, align = 'end', title = 'Actions' }: DropdownProps) => {
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [open, setOpen] = useState(false);

  if (isPhone) {
    return (
      <PickerShell bare open={open} onOpenChange={setOpen} trigger={trigger} title={title}>
        <ul className="flex flex-col gap-0.5">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className={item.separatorBefore ? 'mt-1 border-t border-border/60 pt-1' : undefined}>
              <PhoneRow item={item} onDone={() => setOpen(false)} />
            </li>
          ))}
        </ul>
      </PickerShell>
    );
  }

  return (
  <DropdownMenu>
    <DropdownMenuTrigger asChild className="focus:outline-none">
      {trigger}
    </DropdownMenuTrigger>
    
    <DropdownMenuContent 
      align={align} 
      className="w-56 p-1.5 rounded-xl border border-border bg-surface animate-in fade-in-80 zoom-in-95 duration-200"
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const isDestructive = item.variant === 'destructive';
        
        const itemClasses = cn(
          "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer outline-none active:scale-[0.98]",
          isDestructive
            ? "text-danger focus:bg-danger/10 focus:text-danger"
            : "text-text-secondary focus:bg-surface-hover focus:text-text"
        );

        const iconClasses = cn(
          "shrink-0 transition-colors",
          isDestructive ? "text-danger" : "text-text-light group-focus:text-text-muted"
        );

        return (
          <Fragment key={`${item.label}-${index}`}>
            {item.separatorBefore && (
              <DropdownMenuSeparator className="my-1.5 bg-border" />
            )}
            
            {item.to ? (
              <DropdownMenuItem asChild variant={item.variant} className="group p-0">
                <NavLink to={item.to} className={itemClasses}>
                  {Icon && <Icon size={16} strokeWidth={2.5} className={iconClasses} />}
                  {item.label}
                </NavLink>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={item.onClick}
                variant={item.variant}
                className={cn("group", itemClasses)}
              >
                {Icon && <Icon size={16} strokeWidth={2.5} className={iconClasses} />}
                {item.label}
              </DropdownMenuItem>
            )}
          </Fragment>
        );
      })}
    </DropdownMenuContent>
  </DropdownMenu>
  );
};