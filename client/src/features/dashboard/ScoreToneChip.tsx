import { CircleAlert, CircleArrowDown, CircleCheck } from 'lucide-react';
import { IconChip } from '../../components/iconChip';

interface ScoreToneChipProps {
  value: number | null | undefined;
  className?: string;
}

export const ScoreToneChip = ({ value, className }: ScoreToneChipProps) => {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 80) return <IconChip className={className} icon={CircleCheck} tone="bg-success" label="Good" />;
  if (value >= 50) return <IconChip className={className} icon={CircleAlert} tone="bg-warning" label="Fair" />;
  return <IconChip className={className} icon={CircleArrowDown} tone="bg-danger" label="Low" />;
};
