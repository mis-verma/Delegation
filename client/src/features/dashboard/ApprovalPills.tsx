import { memo } from 'react';
import { Link } from 'react-router';
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

const LINK = {
  light: 'hover:bg-border/70 focus-visible:ring-primary-500/50',
  dark: 'hover:bg-white/20 focus-visible:ring-white/60',
} as const;

const ApprovalPillsComponent = ({ parts, missing = false, tone = 'light' }: ApprovalPillsProps) => (
  <span className="flex flex-wrap items-center gap-1">
    {parts.map((p) => {
      const shownValue = missing ? '-' : p.value;
      const content = (
        <>
          {p.label}
          <span className={cn('font-bold tabular-nums', tone === 'light' && !missing && p.value > 0 && 'text-text')}>{shownValue}</span>
        </>
      );
      const base = cn('inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 py-0.5 t-meta font-medium leading-none', PILL[tone]);
      return p.href ? (
        <Link
          key={p.key}
          to={p.href}
          viewTransition
          aria-label={`${p.label}: ${missing ? 'could not load' : p.value}. Open`}
          className={cn(base, 'relative z-10 outline-none transition-colors duration-150 focus-visible:ring-2', LINK[tone])}
        >
          {content}
        </Link>
      ) : (
        <span key={p.key} className={base} aria-hidden="true">{content}</span>
      );
    })}
  </span>
);

export const ApprovalPills = memo(ApprovalPillsComponent);
