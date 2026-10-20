import { CheckCheck, CircleDashed, Clock3, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconChip } from '../../components/iconChip';
import { formatPct } from '../../lib/percent';
import { rateToneClass } from '../checklist/checklistDisplay';

export const ScorePct = ({ value, strong, className }: { value: number | null; strong?: boolean; className?: string }) => (
  <span className={cn('tabular-nums', strong ? 'font-bold' : 'font-semibold', value === null ? 'text-text-light' : rateToneClass(value), className)}>
    {formatPct(value)}
  </span>
);

export const CountsLine = ({ due, done, late, notDone, open }: { due?: number; done: number; late: number; notDone: number; open?: number }) => (
  <p className="flex flex-wrap items-center gap-1.5">
    {due !== undefined && <IconChip icon={Clock3} tone="bg-primary-600" label={`${due} due`} labelClassName="tabular-nums" />}
    <IconChip icon={CheckCheck} tone="bg-success" label={`${done} done`} labelClassName="tabular-nums" />
    {late > 0 && <IconChip icon={Clock3} tone="bg-warning" label={`${late} late`} labelClassName="tabular-nums" />}
    {notDone > 0 && <IconChip icon={XCircle} tone="bg-danger" label={`${notDone} not done`} labelClassName="tabular-nums" />}
    {open ? <IconChip icon={CircleDashed} tone="bg-text-muted" label={`${open} open`} labelClassName="tabular-nums" /> : null}
  </p>
);
