import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineError } from '../../../components';
import { PhotoThumbs } from '../../verification/PhotoThumbs';
import { useChecklistItemPreviousQuery } from '../hook';
import { formatDateTime } from '../checklistDisplay';
import type { ChecklistItemPrevious } from '../../../api/checklistInstances';

const answerOf = (previous: ChecklistItemPrevious): string => {
  if (previous.isNotApplicable) return 'Not applicable';
  if (previous.booleanAnswer) return previous.booleanAnswer === 'YES' ? 'Yes' : 'No';
  if (previous.textValue) return previous.textValue;
  if (previous.numericValue !== null) return String(previous.numericValue);
  return 'Done';
};

interface PreviousAnswerPanelProps {
  instanceId: string;
  itemId: string;
}

export const PreviousAnswerPanel = ({ instanceId, itemId }: PreviousAnswerPanelProps) => {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError, refetch } = useChecklistItemPreviousQuery(instanceId, itemId, open);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-1.5 self-start rounded-lg px-1.5 -mx-1.5 t-meta font-display font-semibold text-primary-700 transition-colors duration-150 hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:min-h-8 dark:text-primary-300"
      >
        <History size={13} aria-hidden="true" />
        {open ? 'Hide last time' : 'Compare with last time'}
        <ChevronDown size={13} aria-hidden="true" className={cn('transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-hover/30 p-3">
          {isPending && <p className="t-meta font-display text-text-muted" role="status">Loading the earlier answer.</p>}
          {isError && <InlineError message="Couldn't load the earlier answer." onRetry={() => void refetch()} />}
          {!isPending && !isError && !data && <p className="t-meta font-display text-text-muted">There is no earlier answer to compare with.</p>}
          {data && (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2 t-meta font-display text-text-muted">
                <span className="font-semibold text-text">{formatDateTime(data.completedAt ?? data.periodStart)}</span>
                {data.completedByName && <span>by {data.completedByName}</span>}
                <span className="font-semibold text-text">Answer: {answerOf(data)}</span>
                {data.sendBackCount > 0 && <span className="font-semibold text-danger">Sent back {data.sendBackCount === 1 ? 'once' : `${data.sendBackCount} times`}</span>}
              </p>
              {data.conditionalReasonValue && <p className="t-meta font-display text-text-secondary"><span className="font-semibold text-text-muted">Reason: </span>{data.conditionalReasonValue}</p>}
              {data.remarks && <p className="t-meta font-display text-text-secondary"><span className="font-semibold text-text-muted">Remark: </span>{data.remarks}</p>}
              {data.images.length > 0 ? (
                <PhotoThumbs files={data.images.map((img) => ({ id: img.id, url: img.url, mimeType: img.mimeType, name: img.originalFilename, captureMethod: img.captureMethod }))} label="Earlier photo" />
              ) : (
                <p className="t-meta font-display text-text-muted">No photos last time.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
