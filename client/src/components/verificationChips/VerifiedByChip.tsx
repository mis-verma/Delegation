import { memo } from 'react';
import { ShieldCheck, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInitials } from '../../lib/getInitials';
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
}: VerifiedByChipProps) {
  const cleanName = verifierName?.trim();

  if (!cleanName) {
    if (!showFallback) return null;
    return (
      <span
        title={title ?? fallbackText}
        className={cn(
          'inline-flex h-6 sm:h-7 shrink-0 items-center gap-1.5 rounded-md border border-dashed border-slate-200/70 bg-slate-50/80 px-2.5 py-1 text-xs text-slate-400 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-500',
          className,
        )}
      >
        <User className="size-3 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        <span className="truncate">{fallbackText}</span>
      </span>
    );
  }

  const initials = getInitials(cleanName);
  const tooltip = title ?? (role ? `Verified by ${cleanName} (${role})` : `Verified by ${cleanName}`);

  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex h-6 sm:h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-200/70 bg-slate-100/80 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-200',
        className,
      )}
    >
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-700 text-[10px] font-bold text-white font-display leading-none"
        aria-hidden="true"
      >
        {initials || <ShieldCheck className="size-2.5" />}
      </span>
      <span className="min-w-0 max-w-[130px] truncate sm:max-w-[180px]">{cleanName}</span>
      {role && (
        <span className="shrink-0 rounded bg-slate-200/80 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-700/90 dark:text-slate-300">
          {role}
        </span>
      )}
    </span>
  );
});

VerifiedByChip.displayName = 'VerifiedByChip';
