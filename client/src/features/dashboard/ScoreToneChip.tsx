import { CircleAlert, CircleArrowDown, CircleCheck } from 'lucide-react';
import { IconChip } from '../../components/iconChip';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';

interface ScoreToneChipProps {
  value: number | null | undefined;
  className?: string;
}

export const ScoreToneChip = ({ value, className }: ScoreToneChipProps) => {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= GOOD_FROM) return <IconChip className={className} icon={CircleCheck} tone="bg-success" label="Good" />;
  if (value >= FAIR_FROM) return <IconChip className={className} icon={CircleAlert} tone="bg-warning" label="Fair" />;
  return <IconChip className={className} icon={CircleArrowDown} tone="bg-danger" label="Low" />;
};
