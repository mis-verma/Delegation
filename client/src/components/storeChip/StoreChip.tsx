import { Store } from 'lucide-react';
import { IconChip } from '../iconChip';

interface StoreChipProps {
  name: string;
  className?: string;
}

export const StoreChip = ({ name, className }: StoreChipProps) => (
  <IconChip icon={Store} tone="bg-coral-500" label={name} className={className} />
);
