import { memo, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APPROVAL_STATUS_CONFIG, FALLBACK_APPROVAL_CONFIG, VERIFICATION_CHIP } from './constants';

export interface ApprovalStatusChipProps {
  /** Verification status string e.g. APPROVED, PENDING_APPROVAL, REJECTED, NOT_SUBMITTED */
  status?: string | null;
  /** Custom label override if needed */
  label?: ReactNode;
  /** An icon instead of the dot. Off by default: the dot carries the status. */
  icon?: LucideIcon | false;
  /** Whether to show status indicator dot */
  showDot?: boolean;
  /** Extra class names */
  className?: string;
  /** Accessible title attribute */
  title?: string;
}

/**
 * The status of a run, as a bordered chip with a coloured dot. It shares its shape with the
 * Verified by and Verified at chips beside it, so a row of them reads as one set, and the only
 * colour is the dot, plus red words on the statuses that need chasing.
 */
export const ApprovalStatusChip = memo(function ApprovalStatusChip({
  status = 'PENDING',
  label,
  icon = false,
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
      className={cn(VERIFICATION_CHIP, 'font-semibold', config.text, className)}
    >
      {showDot && (
        <span
          className={cn('size-1.5 shrink-0 rounded-full', config.dot)}
          aria-hidden="true"
        />
      )}
      {IconComponent && (
        <IconComponent className="size-3 shrink-0" strokeWidth={2.25} aria-hidden="true" />
      )}
      <span className="min-w-0 truncate">{resolvedLabel}</span>
    </span>
  );
});

ApprovalStatusChip.displayName = 'ApprovalStatusChip';
