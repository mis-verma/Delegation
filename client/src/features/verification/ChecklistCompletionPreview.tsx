import { CheckCircle2, Circle, AlertTriangle, ImageOff, Flag } from 'lucide-react';
import { Skeleton } from '../../components';
import { summarizeChecklists, type PreviewItem, type PreviewChecklist } from './checklistSummary';

const UPLOADS_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

const ItemRow = ({ item, onFlag }: { item: PreviewItem; onFlag?: (item: PreviewItem) => void }) => {
  const missingRequiredPhotos = item.requiredImageCount > 0 && item.images.length < item.requiredImageCount;
  const needsAttention = !item.isDone || missingRequiredPhotos;

  return (
    <li className="group/item flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        {item.isDone ? (
          <CheckCircle2 size={15} className="text-success shrink-0 mt-0.5" strokeWidth={2.5} />
        ) : (
          <Circle size={15} className="text-text-light shrink-0 mt-0.5" strokeWidth={2.5} />
        )}
        <span className={`text-sm font-display flex-1 min-w-0 ${item.isDone ? 'text-text' : 'text-text-muted'}`}>
          {item.label}
        </span>
        {missingRequiredPhotos && (
          <span className="inline-flex items-center gap-1 t-meta font-display font-bold text-danger shrink-0" title={`Needs ${item.requiredImageCount} photo${item.requiredImageCount === 1 ? '' : 's'}, has ${item.images.length}`}>
            <AlertTriangle size={11} strokeWidth={2.5} />
            {item.images.length}/{item.requiredImageCount}
          </span>
        )}
        {onFlag && needsAttention && (
          <button
            type="button"
            onClick={() => onFlag(item)}
            title="Flag this item in the correction note"
            aria-label={`Flag ${item.label}`}
            className="shrink-0 inline-flex items-center justify-center size-5 pointer-coarse:size-11 rounded text-text-light pointer-coarse:opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100 hover:text-danger hover:bg-danger/10 transition-all duration-150 cursor-pointer outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-danger/30"
          >
            <Flag size={11} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {item.images.length > 0 && (
        <div className="flex items-center gap-1.5 pl-6 flex-wrap">
          {item.images.map((img) => (
            <a
              key={img.id}
              href={`${UPLOADS_BASE}${img.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block size-12 rounded-md overflow-hidden border border-border/60 shrink-0 hover:border-primary-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <img src={`${UPLOADS_BASE}${img.url}`} alt="" className="size-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </li>
  );
};

interface ChecklistCompletionPreviewProps {
  checklists: PreviewChecklist[] | undefined;
  isLoading: boolean;
  onFlagItem?: (item: PreviewItem) => void;
}

export const ChecklistCompletionPreview = ({ checklists, isLoading, onFlagItem }: ChecklistCompletionPreviewProps) => {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden>
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-2/3" />
        ))}
      </div>
    );
  }

  const { total, done, missingPhotos } = summarizeChecklists(checklists);

  if (total === 0) {
    return (
      <p className="flex items-center gap-1.5 t-meta font-display text-text-muted">
        <ImageOff size={13} className="shrink-0" />
        No checklist on this item.
      </p>
    );
  }

  const compliancePct = Math.round((done / total) * 100);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap px-0.5">
        <span className="t-meta font-display font-bold text-text-muted">
          {compliancePct}% complete
        </span>
        <span className="t-meta font-display font-medium text-text-light">
          {done}/{total} items done
        </span>
        {missingPhotos > 0 && (
          <span className="inline-flex items-center gap-1 t-meta font-display font-bold text-danger">
            <AlertTriangle size={11} strokeWidth={2.5} />
            {missingPhotos} missing required photo{missingPhotos === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {checklists!.filter((c) => c.items.length > 0).map((checklist) => (
        <div key={checklist.id} className="flex flex-col gap-1.5">
          <p className="t-meta font-display font-bold text-text-muted">
            {checklist.title}: {checklist.items.filter((i) => i.isDone).length}/{checklist.items.length} done
          </p>
          <ul className="flex flex-col divide-y divide-border/40">
            {checklist.items.map((item) => <ItemRow key={item.id} item={item} onFlag={onFlagItem} />)}
          </ul>
        </div>
      ))}
    </div>
  );
};
