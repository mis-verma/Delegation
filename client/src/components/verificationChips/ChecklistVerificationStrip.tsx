import { memo } from 'react';
import { cn } from '@/lib/utils';
import { ApprovalStatusChip } from './ApprovalStatusChip';
import { VerifiedByChip } from './VerifiedByChip';
import { VerifiedAtChip } from './VerifiedAtChip';
import type { Role } from '../../api/auth';

export interface ChecklistVerificationStripProps {
  /** Approval / verification status e.g. APPROVED, PENDING_APPROVAL, REJECTED, NOT_SUBMITTED */
  status?: string | null;
  /** Custom label override for the status */
  statusLabel?: string;
  /** Full name of the verifier */
  verifierName?: string | null;
  /** Role of the verifier, e.g. PC, ADMIN, HOD */
  verifierRole?: Role | string | null;
  /** ISO string or Date when verified */
  verifiedAt?: string | number | Date | null;
  /** Whether to show a fallback placeholder for verifier if unverified */
  showVerifierFallback?: boolean;
  /** Whether to show a fallback placeholder for timestamp if unverified */
  showVerifiedAtFallback?: boolean;
  /** Timestamp format */
  timestampFormat?: 'datetime' | 'date' | 'time' | 'short';
  /** Extra container class names */
  className?: string;
}

/**
 * Responsive executive metadata strip grouping Approval Status, Verified By, and Verified At.
 * Responsive:
 * - Mobile (< 640px): flex-wrap with compact gap-1.5 to prevent horizontal overflow.
 * - Desktop (>= 640px): balanced whitespace and consistent h-6/h-7 chip alignment.
 */
export const ChecklistVerificationStrip = memo(function ChecklistVerificationStrip({
  status,
  statusLabel,
  verifierName,
  verifierRole,
  verifiedAt,
  showVerifierFallback = false,
  showVerifiedAtFallback = false,
  timestampFormat = 'datetime',
  className,
}: ChecklistVerificationStripProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {status && (
        <ApprovalStatusChip status={status} label={statusLabel} />
      )}
      <VerifiedByChip
        verifierName={verifierName}
        role={verifierRole}
        showFallback={showVerifierFallback}
      />
      <VerifiedAtChip
        timestamp={verifiedAt}
        format={timestampFormat}
        showFallback={showVerifiedAtFallback}
      />
    </div>
  );
});

ChecklistVerificationStrip.displayName = 'ChecklistVerificationStrip';
