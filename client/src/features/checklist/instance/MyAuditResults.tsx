import { Check, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UPLOADS_BASE } from '../../../lib/uploadsBase';
import { useMyAuditResultsQuery } from '../hook';
import { AccessoryTile } from './ChecklistInstanceItemAuditCard';
import { formatDate, formatTimeOnly } from '../checklistDisplay';
import type { MyAuditResult } from '../../../api/checklistInstances';

const noop = () => {};

const ResultCard = ({ result }: { result: MyAuditResult }) => {
  const missing = result.accessories.filter(a => !a.checked).length;
  return (
    <article className="flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text">{result.itemLabel}</h3>
          <p className="text-xs text-text-muted">
            {result.checklistTitle} · {formatDate(result.periodStart)}
            {result.completedAt ? ` · checked ${formatTimeOnly(result.completedAt)}` : ''}
          </p>
        </div>
        {result.accessories.length > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium shrink-0 tabular-nums',
              missing === 0 ? 'bg-success/10 dark:bg-success/15 text-text-secondary' : 'bg-danger/10 dark:bg-danger/15 text-text-secondary',
            )}
          >
            {missing === 0 ? (
              <>
                <Check size={12} strokeWidth={3} className="text-success" aria-hidden />
                All in order
              </>
            ) : (
              `${missing} missing`
            )}
          </span>
        )}
      </div>

      {result.accessories.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {result.accessories.map(a => (
            <li key={a.name}>
              <AccessoryTile name={a.name} checked={a.checked} missing={!a.checked} interactive={false} onToggle={noop} />
            </li>
          ))}
        </ul>
      )}

      {result.images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {result.images.map(img => (
            <li key={img.id}>
              <img
                src={`${UPLOADS_BASE}${img.url}`}
                alt={img.originalFilename ?? 'Photo from your audit'}
                loading="lazy"
                className="size-16 rounded-lg border border-border object-cover bg-surface-hover"
              />
            </li>
          ))}
        </ul>
      )}

      {result.remarks && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-text-secondary">Remarks</p>
          <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{result.remarks}</p>
        </div>
      )}
    </article>
  );
};

// Someone who is audited can't open the run (it lists everyone else's results too), so this is
// their one view of it: their own row, read-only. Renders nothing until there's a result, and
// nothing if the request fails — it's a courtesy view, not something the page depends on.
export const MyAuditResults = () => {
  const { data } = useMyAuditResultsQuery();
  if (!data?.length) return null;

  return (
    <section aria-labelledby="my-audit-results-heading" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={16} className="text-text-muted shrink-0" aria-hidden />
        <div>
          <h2 id="my-audit-results-heading" className="text-sm font-semibold text-text">Your audit results</h2>
          <p className="text-xs text-text-muted">What was recorded about you. Only you can see this.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {data.map(result => <ResultCard key={result.id} result={result} />)}
      </div>
    </section>
  );
};
