import { Building2, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

const CHIP = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-display font-semibold whitespace-nowrap';

export const DepartmentHeadChip = () => (
  <span className={cn(CHIP, 'border-primary-500/25 bg-primary-500/10 text-primary-700 dark:text-primary-300')}>Department head</span>
);

interface PlaceFieldProps {
  kind: 'department' | 'store';
  name?: string;
  /** Deactivated people read quieter; their actions stay at full contrast elsewhere. */
  muted?: boolean;
}

// One labelled row: small tinted icon tile, a tiny label above, then the value. It always renders
// two lines, set or not, so every card in the grid keeps the same height.
export const PlaceField = ({ kind, name, muted }: PlaceFieldProps) => {
  const isStore = kind === 'store';
  const Icon = isStore ? Store : Building2;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={cn(
          'flex items-center justify-center size-8 rounded-lg shrink-0',
          isStore
            ? 'bg-coral-500/10 dark:bg-coral-500/15 text-coral-700 dark:text-coral-300'
            : 'bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300',
          muted && 'opacity-60',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-display font-medium text-text-light leading-tight">
          {isStore ? 'Store' : 'Department'}
        </span>
        <span
          className={cn(
            'text-xs font-display leading-snug truncate',
            name ? cn('font-semibold', muted ? 'text-text-muted' : 'text-text') : 'font-medium text-text-light',
          )}
          title={name}
        >
          {name ?? 'Not set'}
        </span>
      </div>
    </div>
  );
};
