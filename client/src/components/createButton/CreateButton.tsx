import { ChevronDown, Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '../button';

export interface CreateMenuItem {
  key: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  onSelect: () => void;
}

export interface CreateButtonProps {
  label: string;
  onClick: () => void;
  menu?: readonly CreateMenuItem[];
  menuLabel?: string;
  onPreload?: () => void;
  className?: string;
}

const HEIGHT = 'h-9 pointer-coarse:h-11';

export const CreateButton = ({ label, onClick, menu, menuLabel = 'More ways to create', onPreload, className }: CreateButtonProps) => {
  const split = !!menu && menu.length > 0;
  return (
    <div className={cn('inline-flex shrink-0 items-stretch', className)}>
      <Button
        variant="primary"
        size="sm"
        onClick={onClick}
        onMouseEnter={onPreload}
        onFocus={onPreload}
        aria-label={label}
        className={cn('group gap-1.5 font-display font-semibold max-sm:w-11 max-sm:px-0', HEIGHT, split ? 'rounded-r-none' : 'sm:px-3.5')}
      >
        <Plus className="size-4 shrink-0 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.5} aria-hidden="true" />
        <span className="max-sm:sr-only">{label}</span>
      </Button>
      {split && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="primary"
              size="sm"
              aria-label={menuLabel}
              className={cn('rounded-l-none border-l border-l-white/25 px-2 max-sm:w-9', HEIGHT)}
            >
              <ChevronDown className="size-4" strokeWidth={2.5} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-64 rounded-xl p-1.5">
            {menu.map(({ key, label: itemLabel, hint, icon: ItemIcon, onSelect }) => (
              <DropdownMenuItem key={key} onClick={onSelect} className="cursor-pointer gap-3 rounded-lg px-2 py-2">
                <ItemIcon className="size-4 shrink-0 text-text-muted" strokeWidth={2.25} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-display font-semibold text-text">{itemLabel}</span>
                  {hint && <span className="t-meta leading-snug text-text-muted">{hint}</span>}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
