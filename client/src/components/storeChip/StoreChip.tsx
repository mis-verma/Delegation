import { Store } from 'lucide-react';
import { IconChip } from '../iconChip';

interface StoreChipProps {
  name: string;
  className?: string;
}

// The store counterpart of DepartmentChip: one fixed coral tone (stores have no per-name palette),
// so a store reads the same everywhere it is drawn.
export const StoreChip = ({ name, className }: StoreChipProps) => (
  <IconChip icon={Store} tone="bg-coral-500" label={name} className={className} />
);
