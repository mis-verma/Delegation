import { CheckCircle2, Circle, AlertTriangle, ImageOff, Flag } from 'lucide-react';
import { summarizeChecklists, type PreviewItem, type PreviewChecklist } from './checklistSummary';

// Task and Ticket each have their own generated Checklist/ChecklistItem/ChecklistImage types
// (different foreign-key field names — taskChecklistId vs checklistId — but otherwise identical
// shapes). This only reads the fields both share, so one component works for either without a
// caller having to normalize one into the other's exact type first.

// Same "where uploaded files actually live" base every other checklist viewer (TaskChecklistPanel,
// tickets/ChecklistPanel) already points at.
const UPLOADS_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

const ItemRow = ({ item, onFlag }: { item: PreviewItem; onFlag?: (item: PreviewItem) => void }) => {
  // Required photo evidence that never actually showed up — the one state a verifier most needs
  // flagged before approving, not just "not done yet" (which reads as merely incomplete).
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
        <span className={`text-[0.8125rem] font-display flex-1 min-w-0 ${item.isDone ? 'text-text' : 'text-text-muted'}`}>
          {item.label}
        </span>
        {missingRequiredPhotos && (
          <span className="inline-flex items-center gap-1 text-[0.625rem] font-display font-bold text-danger shrink-0" title={`Needs ${item.requiredImageCount} photo${item.requiredImageCount === 1 ? '' : 's'}, has ${item.images.length}`}>
            <AlertTriangle size={11} strokeWidth={2.5} />
            {item.images.length}/{item.requiredImageCount}
          </span>
        )}
        {/* Sends this item straight into the correction note instead of making the verifier retype
            what they just saw — only offered where it's actually actionable (not done, or a
            required photo missing), and only once a rejection callback is wired up by the row. */}
        {onFlag && needsAttention && (
          <button
            type="button"
            onClick={() => onFlag(item)}
            title="Flag this item in the correction note"
            className="shrink-0 inline-flex items-center justify-center size-5 rounded text-text-light opacity-0 group-hover/item:opacity-100 hover:text-danger hover:bg-danger/10 transition-all duration-150 cursor-pointer outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-danger/30"
          >
            <Flag size={11} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {item.images.length > 0 && (
        <div className="flex items-center gap-1.5 pl-[23px] flex-wrap">
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
  /** Wired up by the queue row — flagging an item drops a reference to it straight into the
   *  correction note and opens that panel, so a specific item doesn't have to be retyped by hand. */
  onFlagItem?: (item: PreviewItem) => void;
}

/**
 * A verifier's real question before approving — "was the work actually done, and is the photo
 * proof actually there" — used to only be answerable by leaving the Verification Queue entirely
 * for the full ticket/task detail page. This is a compact, read-only rendering of exactly that:
 * per-item done/not-done plus any uploaded evidence thumbnails, dropped inline into a queue row.
 */
export const ChecklistCompletionPreview = ({ checklists, isLoading, onFlagItem }: ChecklistCompletionPreviewProps) => {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 animate-pulse">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-4 w-2/3 rounded bg-border/50" />
        ))}
      </div>
    );
  }

  const { total, done, missingPhotos } = summarizeChecklists(checklists);

  if (total === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-display text-text-muted">
        <ImageOff size={13} className="shrink-0" />
        No checklist on this item.
      </p>
    );
  }

  const compliancePct = Math.round((done / total) * 100);

  return (
    <div className="flex flex-col gap-3">
      {/* Compliance summary — the same "how much is actually done, what's still outstanding" read
          a verifier gets from a score/compliance header on other checklist-approval tools, just
          computed from what's already loaded instead of a separate scoring pass. */}
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap px-0.5">
        <span className="text-[0.6875rem] font-display font-bold text-text-muted tracking-wide">
          {compliancePct}% complete
        </span>
        <span className="text-[0.6875rem] font-display font-medium text-text-light">
          {done}/{total} items done
        </span>
        {missingPhotos > 0 && (
          <span className="inline-flex items-center gap-1 text-[0.6875rem] font-display font-bold text-danger">
            <AlertTriangle size={11} strokeWidth={2.5} />
            {missingPhotos} missing required photo{missingPhotos === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {checklists!.filter((c) => c.items.length > 0).map((checklist) => (
        <div key={checklist.id}>
          <p className="text-[0.6875rem] font-display font-bold text-text-muted tracking-wide mb-1">
            {checklist.title} — {checklist.items.filter((i) => i.isDone).length}/{checklist.items.length} done
          </p>
          <ul className="flex flex-col divide-y divide-border/40">
            {checklist.items.map((item) => <ItemRow key={item.id} item={item} onFlag={onFlagItem} />)}
          </ul>
        </div>
      ))}
    </div>
  );
};
