import { Fragment, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
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
}

export const Dropdown = ({ trigger, items, align = 'end' }: DropdownProps) => (
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
        
        // Base classes applied to the item row for consistent hover/focus states
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