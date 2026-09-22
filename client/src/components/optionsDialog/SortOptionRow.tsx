import { Check, type LucideIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '../button';
import { OptionRow } from '../filterRow';

/**
 * The "Sort by" row inside an Options dialog — a dropdown showing the current sort, with a tick
 * against whichever entry is active.
 *
 * Delegation and Tickets had identical copies of this differing only in their sort-key type and
 * which label/icon maps they read. Both maps are passed in, so the option order still comes from
 * the module's own `SORT_LABEL` key order exactly as before.
 */
interface SortOptionRowProps<K extends string> {
  labels: Record<K, string>;
  icons: Record<K, LucideIcon>;
  value: K;
  onChange: (key: K) => void;
}

export const SortOptionRow = <K extends string>({ labels, icons, value, onChange }: SortOptionRowProps<K>) => {
  const ActiveIcon: LucideIcon = icons[value];

  return (
    <OptionRow label="Sort by">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className="h-9 px-3 gap-1.5 border border-border/60 rounded-lg w-fit">
            <ActiveIcon size={14} className="text-text-muted" />
            <span className="text-xs font-display font-medium">{labels[value]}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44 rounded-xl">
          {(Object.keys(labels) as K[]).map((key) => {
            const Icon: LucideIcon = icons[key];
            return (
              <DropdownMenuItem key={key} onClick={() => onChange(key)} className="gap-2.5 py-2 cursor-pointer">
                <Icon size={14} className="text-text-muted" />
                <span className="font-display font-medium text-sm">{labels[key]}</span>
                {value === key && <Check size={14} className="ml-auto text-primary-600" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </OptionRow>
  );
};
