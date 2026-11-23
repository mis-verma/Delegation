import {
  CircleDashed,
  Clock,
  CornerUpLeft,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldX,
  type LucideIcon,
} from 'lucide-react';

export interface ApprovalStatusMeta {
  label: string;
  tone: string;
  dot: string;
  icon: LucideIcon;
}

/**
 * Constant O(1) static lookup map for approval & verification statuses.
 * Frozen to prevent any runtime mutation and ensure zero conditional overhead.
 */
export const APPROVAL_STATUS_CONFIG: Readonly<Record<string, ApprovalStatusMeta>> = Object.freeze({
  APPROVED: Object.freeze({
    label: 'Verified',
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30',
    dot: 'bg-emerald-500',
    icon: ShieldCheck,
  }),
  PENDING_APPROVAL: Object.freeze({
    label: 'Pending approval',
    tone: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30',
    dot: 'bg-amber-500',
    icon: Clock,
  }),
  PENDING: Object.freeze({
    label: 'Pending approval',
    tone: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30',
    dot: 'bg-amber-500',
    icon: Clock,
  }),
  CORRECTION_REQUESTED: Object.freeze({
    label: 'Correction requested',
    tone: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-500/30',
    dot: 'bg-rose-500',
    icon: CornerUpLeft,
  }),
  REJECTED: Object.freeze({
    label: 'Sent back',
    tone: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-500/30',
    dot: 'bg-rose-500',
    icon: ShieldX,
  }),
  SENT_BACK: Object.freeze({
    label: 'Sent back',
    tone: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-500/30',
    dot: 'bg-rose-500',
    icon: CornerUpLeft,
  }),
  SELF_RECHECK_WINDOW: Object.freeze({
    label: 'Self-recheck open',
    tone: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-500/30',
    dot: 'bg-sky-500',
    icon: RotateCcw,
  }),
  READY_TO_SUBMIT: Object.freeze({
    label: 'Ready to submit',
    tone: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-500/30',
    dot: 'bg-indigo-500',
    icon: Send,
  }),
  NOT_SUBMITTED: Object.freeze({
    label: 'Not submitted',
    tone: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700',
    dot: 'bg-slate-400',
    icon: CircleDashed,
  }),
  SUBMITTED: Object.freeze({
    label: 'Submitted',
    tone: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30',
    dot: 'bg-blue-500',
    icon: Send,
  }),
});

export const FALLBACK_APPROVAL_CONFIG: ApprovalStatusMeta = Object.freeze({
  label: 'Pending',
  tone: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700',
  dot: 'bg-slate-400',
  icon: Clock,
});

/**
 * One look for both verification chips: a crisp border, no fill, and nothing inside but the
 * icon and its words. Shared so the two can never drift apart.
 */
export const VERIFICATION_CHIP =
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 t-meta font-display text-text-secondary sm:h-7';

export const VERIFICATION_CHIP_EMPTY =
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 t-meta font-display text-text-light sm:h-7';
