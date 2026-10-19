import { PrioritySelect } from '../../../components/priorityChip';
import { PRIORITY_CONFIG } from '../ticketDisplay';
import type { TicketPriority } from './formConstants';

const OPTIONS = (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((p) => ({ value: p, label: PRIORITY_CONFIG[p].label, solid: PRIORITY_CONFIG[p].solid, icon: PRIORITY_CONFIG[p].icon }));

export const TicketPriorityChipPicker = ({
  value,
  onChange,
  fullWidth = false,
  triggerClassName,
}: {
  value: TicketPriority;
  onChange: (v: TicketPriority) => void;
  fullWidth?: boolean;
  triggerClassName?: string;
}) => <PrioritySelect value={value} onChange={onChange} options={OPTIONS} fullWidth={fullWidth} triggerClassName={triggerClassName} />;
