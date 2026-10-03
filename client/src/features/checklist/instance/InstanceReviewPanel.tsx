import { memo, useMemo } from 'react';
import { AlertTriangle, Ban, CornerUpLeft, Check } from 'lucide-react';
import { IconChip } from '../../../components';
import { cn } from '@/lib/utils';
import { answerVerdict, runScores } from '../checklistCompliance';
import { complianceToneClass, formatDateTime } from '../checklistDisplay';
import { EvidenceThumb } from './EvidenceThumb';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

// What the person answered, in words, so a reviewer can judge a question without opening the full
// checklist. Types that carry no readable answer (a plain tick) return null.
const answerText = (item: ChecklistInstanceItem): string | null => {
  switch (item.itemType) {
    case 'YES_NO':
      return item.booleanAnswer === 'YES' ? 'Answered Yes' : item.booleanAnswer === 'NO' ? 'Answered No' : null;
    case 'PASS_FAIL':
      return item.booleanAnswer === 'YES' ? 'Pass' : item.booleanAnswer === 'NO' ? 'Fail' : null;
    case 'MULTIPLE_CHOICE':
    case 'DROPDOWN':
    case 'TEXT_BOX':
      return item.textValue ? `Answered: ${item.textValue}` : null;
    case 'NUMBER_ENTRY':
    case 'CASH_TALLY':
      return item.numericValue != null ? `Entered ${item.numericValue}${item.numberEntryUnit ? ` ${item.numberEntryUnit}` : ''}` : null;
    case 'RATING':
      return item.numericValue != null ? `Rated ${item.numericValue} of ${item.ratingScale ?? 5}` : null;
    case 'DATE_TIME':
      return item.dateValue ? `Picked ${formatDateTime(item.dateValue)}` : null;
    case 'GPS':
      return item.gpsLat != null ? 'Location recorded' : null;
    case 'SIGNATURE':
    case 'DUAL_SIGNATURE':
      return item.signatureValue ? 'Signed' : null;
    case 'QR_SCAN':
      return item.textValue ? 'Code scanned' : null;
    case 'AUDIT': {
      const checked = item.submissions.filter(s => s.isDone).length;
      return `${checked} of ${item.submissions.length} people checked`;
    }
    default:
      return null;
  }
};

interface ReviewRowProps {
  item: ChecklistInstanceItem;
  selected: boolean;
  disabled: boolean;
  onToggle: (itemId: string) => void;
}

const ReviewRow = memo(function ReviewRow({ item, selected, disabled, onToggle }: ReviewRowProps) {
  const verdict = answerVerdict(item);
  const answer = item.isNotApplicable ? null : answerText(item);
  const missingPhotos = item.requiredImageCount > 0 && !item.isNotApplicable && item.images.length < item.requiredImageCount;

  return (
    <li className={cn('flex items-start gap-1 py-2.5 first:pt-0 last:pb-0 rounded-lg transition-colors duration-150', selected && 'bg-danger/5')}>
      {/* The whole 44px square is the tap target, so a finger can pick the question that was done badly. */}
      <label className="flex items-center justify-center size-11 sm:size-8 shrink-0 cursor-pointer -ml-1.5">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={selected}
          disabled={disabled}
          onChange={() => onToggle(item.id)}
          aria-label={`Send back: ${item.label}`}
        />
        <span
          className={cn(
            'flex items-center justify-center size-5 rounded-md border transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-danger/40',
            selected ? 'bg-danger border-danger text-white' : 'bg-surface border-border hover:border-danger/60',
          )}
          aria-hidden
        >
          <Check size={13} strokeWidth={3} className={cn('transition-opacity duration-150', selected ? 'opacity-100' : 'opacity-0')} />
        </span>
      </label>

      <div className="flex flex-col gap-1.5 min-w-0 flex-1 pt-1 sm:pt-0.5">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <p className="text-sm font-display font-medium text-text leading-snug min-w-0">{item.label}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.isNotApplicable && <IconChip icon={Ban} tone="bg-text-muted" label="Not applicable" />}
            {verdict === 'bad' && item.sendBackCount === 0 && <IconChip icon={AlertTriangle} tone="bg-warning" label="Not an acceptable answer" />}
            {item.sendBackCount > 0 && (
              <IconChip
                icon={CornerUpLeft}
                tone="bg-danger"
                label={item.sendBackCount === 1 ? 'Sent back once' : `Sent back ${item.sendBackCount} times`}
                title="Counts against compliance"
              />
            )}
            {missingPhotos && (
              <IconChip icon={AlertTriangle} tone="bg-danger" label={`Photos ${item.images.length}/${item.requiredImageCount}`} />
            )}
          </div>
        </div>

        {answer && <p className="text-xs font-display text-text-secondary">{answer}</p>}
        {item.remarks && (
          <p className="text-xs font-display text-text-muted whitespace-pre-wrap break-words">
            {item.isNotApplicable ? 'Reason' : 'Remark'}: {item.remarks}
          </p>
        )}
        {item.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.images.map(img => <EvidenceThumb key={img.id} image={img} fallbackAlt={`Evidence for ${item.label}`} />)}
          </div>
        )}
      </div>
    </li>
  );
});

interface InstanceReviewPanelProps {
  items: ChecklistInstanceItem[];
  /** Questions the reviewer has ticked to send back. */
  selected: ReadonlySet<string>;
  onToggle: (itemId: string) => void;
  /** True while a review request is in flight. */
  disabled?: boolean;
}

// The expanded body of a checklist waiting for review: the score so far, then every question with
// what was answered, any remark and photos, and a tick box to send just that question back. Used by
// the Verification Queue and the department Approvals page so both review the same way.
export const InstanceReviewPanel = memo(function InstanceReviewPanel({ items, selected, onToggle, disabled = false }: InstanceReviewPanelProps) {
  const scores = useMemo(() => runScores(items), [items]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs font-display">
        <span className="font-semibold text-text-secondary tabular-nums">{scores.completion}% complete</span>
        <span className="text-text-muted tabular-nums">{scores.done} of {scores.total} questions done</span>
        {scores.compliance !== null && (
          <span className={cn('font-semibold tabular-nums', complianceToneClass(scores.compliance))}>
            Compliance {scores.compliance}% ({scores.good} of {scores.scored} answered well)
          </span>
        )}
      </div>
      <p className="text-xs font-display text-text-muted leading-relaxed">
        Tick a question that was not done properly to send only that one back. It also counts against compliance.
      </p>
      <ul className="flex flex-col divide-y divide-border/40">
        {items.map(item => (
          <ReviewRow key={item.id} item={item} selected={selected.has(item.id)} disabled={disabled} onToggle={onToggle} />
        ))}
      </ul>
    </div>
  );
});
