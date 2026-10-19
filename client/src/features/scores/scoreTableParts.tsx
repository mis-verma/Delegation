import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const NUM_HEAD = 'px-3 py-2 text-right';

export const NumHead = ({ children, className, title, rowSpan, scope = 'col', colSpan }: { children: ReactNode; className?: string; title?: string; rowSpan?: number; colSpan?: number; scope?: 'col' | 'colgroup' }) => (
  <th scope={scope} title={title} rowSpan={rowSpan} colSpan={colSpan} className={cn(NUM_HEAD, 'min-w-20 t-meta font-display font-semibold text-text-secondary', className)}>
    {children}
  </th>
);

export const SortHead = <K extends string>({ label, sortKey, active, ascending, onSort, className, rowSpan }: { label: string; sortKey: K; active: K; ascending: boolean; onSort: (k: K) => void; className?: string; rowSpan?: number }) => (
  <th scope="col" rowSpan={rowSpan} aria-sort={active === sortKey ? (ascending ? 'ascending' : 'descending') : 'none'} className={cn('min-w-20 bg-surface-hover', NUM_HEAD, className)}>
    <button type="button" onClick={() => onSort(sortKey)} className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center justify-end gap-0.5 t-meta font-display font-semibold text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40">
      {label}
      {active === sortKey && (ascending ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
    </button>
  </th>
);

export const NumCell = ({ children, className, meta }: { children: ReactNode; className?: string; meta?: boolean }) => (
  <td className={cn('px-3 py-2 text-right tabular-nums', meta ? 't-meta' : 't-card', className)}>{children}</td>
);

export const DepartmentLine = ({ name }: { name?: string | null }) => (name ? <span className="block t-meta text-text-muted">{name}</span> : null);
