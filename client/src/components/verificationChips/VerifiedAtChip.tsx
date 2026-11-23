import { memo, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface VerifiedAtChipProps {
  /** Timestamp in ISO string, date object, or unix epoch */
  timestamp?: string | number | Date | null;
  /** Presentation format: full datetime, date only, time only, or compact */
  format?: 'datetime' | 'date' | 'time' | 'short';
  /** Whether to render a muted placeholder when no timestamp is present */
  showFallback?: boolean;
  /** Text for the placeholder */
  fallbackText?: string;
  /** Extra class names */
  className?: string;
  /** Accessible title override */
  title?: string;
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/**
 * Tabular timestamp badge for verification / approval timestamps.
 * Guarantees zero layout shift via tabular numerals and consistent height.
 */
export const VerifiedAtChip = memo(function VerifiedAtChip({
  timestamp,
  format = 'datetime',
  showFallback = false,
  fallbackText = '—',
  className,
  title,
}: VerifiedAtChipProps) {
  const parsedDate = useMemo(() => {
    if (!timestamp) return null;
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? null : d;
  }, [timestamp]);

  const formattedText = useMemo(() => {
    if (!parsedDate) return null;
    try {
      if (format === 'time') return TIME_FORMATTER.format(parsedDate);
      if (format === 'date') return DATE_FORMATTER.format(parsedDate);
      if (format === 'short') {
        return `${parsedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${TIME_FORMATTER.format(parsedDate)}`;
      }
      return DATE_TIME_FORMATTER.format(parsedDate);
    } catch {
      return null;
    }
  }, [parsedDate, format]);

  if (!formattedText) {
    if (!showFallback) return null;
    return (
      <span
        title={title ?? 'Timestamp not recorded'}
        className={cn(
          'inline-flex h-6 sm:h-7 shrink-0 items-center gap-1.5 rounded-md border border-dashed border-slate-200/60 bg-slate-50/80 px-2.5 py-1 text-xs tabular-nums text-slate-400 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-500',
          className,
        )}
      >
        <Clock className="size-3 shrink-0" aria-hidden="true" />
        <span>{fallbackText}</span>
      </span>
    );
  }

  const isoTime = parsedDate?.toISOString();

  return (
    <span
      title={title ?? (isoTime ? `Verified at ${isoTime}` : 'Verified timestamp')}
      className={cn(
        'inline-flex h-6 sm:h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-xs tabular-nums text-slate-600 transition-colors dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300',
        className,
      )}
    >
      <Clock
        className="size-3 shrink-0 text-slate-400 dark:text-slate-400"
        strokeWidth={2.25}
        aria-hidden="true"
      />
      <time dateTime={isoTime} className="truncate">
        {formattedText}
      </time>
    </span>
  );
});

VerifiedAtChip.displayName = 'VerifiedAtChip';
