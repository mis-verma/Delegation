import { Loader2 } from 'lucide-react';

interface UploadProgressProps {
  count: number;
  fraction: number | null;
  noun?: { one: string; many: string };
}

export const UploadProgress = ({ count, fraction, noun = { one: 'file', many: 'files' } }: UploadProgressProps) => {
  const percent = fraction === null ? null : Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  const label = `Adding ${count} ${count === 1 ? noun.one : noun.many}`;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1" role="status">
      <span className="flex items-center gap-1.5 t-meta font-display font-medium text-text-muted">
        <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{label}</span>
        {percent !== null && <span className="tabular-nums">{percent}%</span>}
      </span>
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="relative block h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-surface-hover"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-primary-500 transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${percent ?? 8}%` }}
        />
      </span>
    </div>
  );
};
