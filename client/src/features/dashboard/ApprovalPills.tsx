import { cn } from '@/lib/utils';
import type { BoardApprovalPart } from './boardTypes';

interface ApprovalPillsProps {
  parts: readonly BoardApprovalPart[];
  missing?: boolean;
  tone?: 'light' | 'dark';
}

const PILL = {
  light: 'bg-surface-hover text-text-secondary',
  dark: 'bg-white/10 text-white/80',
} as const;

export const ApprovalPills = ({ parts, missing = false, tone = 'light' }: ApprovalPillsProps) => (
  <span className="flex flex-wrap items-center gap-1" aria-hidden="true">
    {parts.map((p) => (
      <span key={p.key} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 t-meta font-medium leading-none', PILL[tone])}>
        {p.label}
        <span className={cn('font-bold tabular-nums', tone === 'light' && !missing && p.value > 0 && 'text-text')}>{missing ? '-' : p.value}</span>
      </span>
    ))}
  </span>
);
