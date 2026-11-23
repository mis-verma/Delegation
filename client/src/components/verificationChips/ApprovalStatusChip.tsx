import { memo, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APPROVAL_STATUS_CONFIG, FALLBACK_APPROVAL_CONFIG } from './constants';

export interface ApprovalStatusChipProps {
  /** Verification status string e.g. APPROVED, PENDING_APPROVAL, REJECTED, NOT_SUBMITTED */
  status?: string | null;
  /** Custom label override if needed */
  label?: ReactNode;
  /** Icon override or false to hide */
  icon?: LucideIcon | false;
  /** Whether to show status indicator dot */
  showDot?: boolean;
  /** Extra class names */
  className?: string;
  /** Accessible title attribute */
  title?: string;
}

/**
 * Executive-grade pill badge for checklist and task approval statuses.
 * Backed by an O(1) static lookup map with zero conditional overhead.
 */
export const ApprovalStatusChip = memo(function ApprovalStatusChip({
  status = 'PENDING',
  label,
  icon,
  showDot = true,
  className,
  title,
}: ApprovalStatusChipProps) {
  const normalizedKey = (status ?? 'PENDING').toUpperCase();
  const config = APPROVAL_STATUS_CONFIG[normalizedKey] ?? FALLBACK_APPROVAL_CONFIG;
  const resolvedLabel = label ?? config.label;
  const IconComponent = icon === false ? null : (icon ?? config.icon);

  return (
    <span
      title={title ?? (typeof resolvedLabel === 'string' ? resolvedLabel : undefined)}
      className={cn(
        'inline-flex h-6 sm:h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-tight ring-1 ring-inset transition-colors',
        config.tone,
        className,
      )}
    >
      {showDot && (
        <span
          className={cn('size-1.5 shrink-0 rounded-full', config.dot)}
          aria-hidden="true"
        />
      )}
      {IconComponent && (
        <IconComponent className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />
      )}
      <span className="min-w-0 truncate">{resolvedLabel}</span>
    </span>
  );
});

ApprovalStatusChip.displayName = 'ApprovalStatusChip';
