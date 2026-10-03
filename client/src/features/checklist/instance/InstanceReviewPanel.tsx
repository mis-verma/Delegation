import { memo, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Check, CheckCheck, ChevronDown, CornerUpLeft, Flag } from 'lucide-react';
import { IconChip } from '../../../components';
import { cn } from '@/lib/utils';
import { runScores } from '../checklistCompliance';
import { complianceToneClass, formatDateTime } from '../checklistDisplay';
import { EvidenceThumb } from './EvidenceThumb';
import { itemFlags, needsLookRank, type ItemFlags } from './reviewFlags';
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

const QUESTION_NOTE_MAX = 200;

interface ReviewRowProps {
  item: ChecklistInstanceItem;
  flags: ItemFlags;
  selected: boolean;
  disabled: boolean;
  onToggle: (itemId: string) => void;
  /** This question's own note for the send-back; only shown while it is ticked. */
  note: string;
  onNoteChange?: (itemId: string, note: string) => void;
  /** The reviewer's note from the last send-back, shown on questions that were fixed since. */
  previousNote: string | null;
}

const ReviewRow = memo(function ReviewRow({ item, flags, selected, disabled, onToggle, note, onNoteChange, previousNote }: ReviewRowProps) {
  const answer = item.isNotApplicable ? null : answerText(item);

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
            {flags.critical && <IconChip icon={Flag} tone="bg-danger" label="Critical" title="Marked critical by the checklist author" />}
            {item.isNotApplicable && <IconChip icon={Ban} tone="bg-text-muted" label="Not applicable" />}
            {flags.bad && <IconChip icon={AlertTriangle} tone="bg-warning" label="Not an acceptable answer" />}
            {flags.sentBack && (
              <IconChip
                icon={CornerUpLeft}
                tone="bg-danger"
                label={item.sendBackCount === 1 ? 'Sent back once' : `Sent back ${item.sendBackCount} times`}
                title="Counts against compliance"
              />
            )}
            {flags.fixed && <IconChip icon={CheckCheck} tone="bg-success" label="Fixed after send-back" />}
            {flags.missingPhotos && (
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
        {flags.fixed && previousNote && (
          <p className="text-xs font-display text-text-muted whitespace-pre-wrap break-words border-l-2 border-border pl-2.5">
            You sent it back with: {previousNote}
          </p>
        )}
        {item.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.images.map(img => <EvidenceThumb key={img.id} image={img} fallbackAlt={`Evidence for ${item.label}`} />)}
          </div>
        )}
        {selected && onNoteChange && (
          <input
            type="text"
            value={note}
            maxLength={QUESTION_NOTE_MAX}
            disabled={disabled}
            onChange={(e) => onNoteChange(item.id, e.target.value)}
            placeholder="Note for this question (optional)"
            aria-label={`Note for: ${item.label}`}
            className="w-full h-11 sm:h-9 px-3 rounded-lg border border-border bg-surface text-sm font-display text-text placeholder:text-text-light transition-colors duration-150 outline-none hover:border-border-hover focus:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          />
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
  /** Per-question send-back notes, by question id. Leave out to hide the note boxes. */
  notes?: Readonly<Record<string, string>>;
  onNoteChange?: (itemId: string, note: string) => void;
  /** The run's note from its last send-back, shown on questions fixed since. */
  lastSendBackNote?: string | null;
  /** Shows the completion / compliance line on top. The review pane has its own score tiles. */
  showScores?: boolean;
}

const SectionTitle = ({ children }: { children: string }) => (
  <h3 className="text-sm font-display font-semibold text-text">{children}</h3>
);

// The body of a checklist waiting for review: failing questions first and open, everything else
// folded away, each with what was answered, any remark and photos, and a tick box to send just that
// question back (with an optional note of its own). Used by the Verification page's review pane and
// the department Approvals page, so both review the same way.
export const InstanceReviewPanel = memo(function InstanceReviewPanel({
  items, selected, onToggle, disabled = false, notes, onNoteChange, lastSendBackNote = null, showScores = true,
}: InstanceReviewPanelProps) {
  const scores = useMemo(() => (showScores ? runScores(items) : null), [items, showScores]);
  const [showRest, setShowRest] = useState(false);

  const { look, rest } = useMemo(() => {
    const withFlags = items.map(item => ({ item, flags: itemFlags(item) }));
    return {
      look: withFlags.filter(r => r.flags.needsLook).sort((a, b) => needsLookRank(a.flags) - needsLookRank(b.flags)),
      rest: withFlags.filter(r => !r.flags.needsLook),
    };
  }, [items]);

  const renderRow = ({ item, flags }: { item: ChecklistInstanceItem; flags: ItemFlags }) => (
    <ReviewRow
      key={item.id}
      item={item}
      flags={flags}
      selected={selected.has(item.id)}
      disabled={disabled}
      onToggle={onToggle}
      note={notes?.[item.id] ?? ''}
      onNoteChange={onNoteChange}
      previousNote={lastSendBackNote}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {scores && (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs font-display">
          <span className="font-semibold text-text-secondary tabular-nums">{scores.completion}% complete</span>
          <span className="text-text-muted tabular-nums">{scores.done} of {scores.total} questions done</span>
          {scores.compliance !== null && (
            <span className={cn('font-semibold tabular-nums', complianceToneClass(scores.compliance))}>
              Compliance {scores.compliance}%
            </span>
          )}
        </div>
      )}
      <p className="text-xs font-display text-text-muted leading-relaxed">
        Tick a question that was not done properly to send only that one back. It also counts against compliance.
      </p>

      <section className="flex flex-col gap-3" aria-label="Needs a look">
        <SectionTitle>{`Needs a look (${look.length})`}</SectionTitle>
        {look.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border/40">{look.map(renderRow)}</ul>
        ) : (
          <p className="text-xs font-display text-text-muted">Nothing stands out. Every answer was within its rule and photos are in.</p>
        )}
      </section>

      {rest.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Everything else">
          <button
            type="button"
            onClick={() => setShowRest((v) => !v)}
            aria-expanded={showRest}
            className="flex items-center gap-1.5 self-start min-h-11 sm:min-h-8 -mx-1.5 px-1.5 rounded-lg text-sm font-display font-semibold text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronDown size={15} aria-hidden className={cn('transition-transform duration-200', showRest ? 'rotate-0' : '-rotate-90')} />
            {`Everything else (${rest.length} ${rest.length === 1 ? 'question' : 'questions'})`}
          </button>
          {showRest && <ul className="flex flex-col divide-y divide-border/40">{rest.map(renderRow)}</ul>}
        </section>
      )}
    </div>
  );
});
