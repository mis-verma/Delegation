import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { StatusBadge } from '../../../../components';

export const DeltaChip = ({ delta }: { delta: number | null }) => {
  if (delta === null) return null;
  const abs = Math.abs(delta);
  return (
    <StatusBadge
      variant={delta > 0 ? 'success' : delta < 0 ? 'critical' : 'neutral'}
      icon={delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus}
      label={delta === 0 ? 'No change' : `${abs} pts`}
      title="Compared with the period before"
    />
  );
};
