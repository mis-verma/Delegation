import { cn } from '@/lib/utils';
import { formatPct } from '../../lib/percent';
import { rateToneClass } from '../checklist/checklistDisplay';

/** A percentage in the rate colour, or a muted dash when there is no figure. */
export const ScorePct = ({ value, strong, className }: { value: number | null; strong?: boolean; className?: string }) => (
  <span className={cn('tabular-nums', strong ? 'font-bold' : 'font-semibold', value === null ? 'text-text-light' : rateToneClass(value), className)}>
    {formatPct(value)}
  </span>
);

/** Done, late and not done in words. Late and not done are coloured only when there are any. */
export const CountsLine = ({ due, done, late, notDone, open }: { due?: number; done: number; late: number; notDone: number; open?: number }) => (
  <p className="t-meta text-text-muted tabular-nums">
    {due !== undefined && <>{due} due, </>}
    {done} done, <span className={late ? 'font-semibold text-warning' : ''}>{late} late</span>, <span className={notDone ? 'font-semibold text-danger' : ''}>{notDone} not done</span>
    {open ? <>, {open} open</> : null}
  </p>
);
