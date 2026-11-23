import { memo } from 'react';
import { ShieldCheck, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VERIFICATION_CHIP, VERIFICATION_CHIP_EMPTY } from './constants';
import type { Role } from '../../api/auth';

export interface VerifiedByChipProps {
  /** The full name or display name of the verifier */
  verifierName?: string | null;
  /** Optional role tag, e.g. PC, ADMIN, HOD, MANAGER */
  role?: Role | string | null;
  /** Whether to render a muted placeholder when no verifier is present */
  showFallback?: boolean;
  /** Text for the muted placeholder */
  fallbackText?: string;
  /** Extra class names */
  className?: string;
  /** Accessible title override */
  title?: string;
  /** The words beside the icon. Off where a column header already names the field. */
  showLabel?: boolean;
}

/**
 * Compact identity pill displaying verifier credentials (initials badge, name, role).
 * Handles unverified or pending states via clean fallback pill or null early return.
 */
export const VerifiedByChip = memo(function VerifiedByChip({
  verifierName,
  role,
  showFallback = false,
  fallbackText = 'Unverified',
  className,
  title,
  showLabel = true,
}: VerifiedByChipProps) {
  const cleanName = verifierName?.trim();

  if (!cleanName) {
    if (!showFallback) return null;
    return (
      <span title={title ?? fallbackText} className={cn(VERIFICATION_CHIP_EMPTY, className)}>
        <User className="size-3 shrink-0" strokeWidth={2.25} aria-hidden="true" />
        {showLabel && <span>Verified by</span>}
        <span className="truncate">{fallbackText}</span>
      </span>
    );
  }

  const tooltip = title ?? (role ? `Verified by ${cleanName} (${role})` : `Verified by ${cleanName}`);

  return (
    <span title={tooltip} className={cn(VERIFICATION_CHIP, className)}>
      <ShieldCheck className="size-3 shrink-0 text-text-muted" strokeWidth={2.25} aria-hidden="true" />
      {showLabel && <span className="text-text-muted">Verified by</span>}
      <span className="min-w-0 max-w-[130px] truncate font-medium text-text sm:max-w-[180px]">{cleanName}</span>
      {role && <span className="shrink-0 uppercase tracking-wide text-text-muted">{role}</span>}
    </span>
  );
});

VerifiedByChip.displayName = 'VerifiedByChip';
