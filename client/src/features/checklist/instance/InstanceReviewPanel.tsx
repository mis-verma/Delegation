import { memo, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Check, CheckCheck, ChevronDown, CornerUpLeft, Flag, History, ShieldCheck, Timer } from 'lucide-react';
import { IconChip } from '../../../components';
import { cn } from '@/lib/utils';
import { answerVerdict, runScores } from '../checklistCompliance';
import { complianceToneClass, formatDateTime } from '../checklistDisplay';
import { EvidenceThumb } from './EvidenceThumb';
import { WaiveAction } from './WaiveAction';
import { RaiseTicketAction } from './RaiseTicketAction';
import { useChecklistItemHistoryQuery } from '../hook';
import { itemFlags, needsLookRank, type ItemFlags } from './reviewFlags';
import { answerText } from './answerText';
import type { ChecklistInstanceItem, ChecklistInstanceItemSubmission } from '../../../api/checklistInstances';

const QUESTION_NOTE_MAX = 200;

const personName = (s: ChecklistInstanceItemSubmission) =>
  `${s.userId.firstName}${s.userId.lastName ? ` ${s.userId.lastName}` : ''}${s.userId.isActive === false ? ' (left)' : ''}`;

// The audit trail line under every question: what kind of task it is, what was done, when and by whom.
// Reviewers only (this panel is behind the Verification and department Approvals pages).
const auditTrailLine = (item: ChecklistInstanceItem): string => {
  const kind = item.itemType === 'AUDIT' ? 'Audit task' : 'Checklist task';
  if (item.itemType === 'AUDIT') return kind;
  if (!item.isDone || !item.completedAt) return `${kind} \u00b7 Not done`;
  const action = item.isNotApplicable ? 'Marked not applicable' : 'Done';
  return `${kind} \u00b7 ${action} ${formatDateTime(item.completedAt)}${item.completedByName ? ` by ${item.completedByName}` : ''}`;
};

// Audit questions are answered per person. This lists every person with the action taken, the time,
// the reason when they could not be checked, and the photos, so nothing the checker recorded is hidden
// behind the "x of y people checked" count.
const AuditPeople = ({ item }: { item: ChecklistInstanceItem }) => {
  const [open, setOpen] = useState(false);
  if (item.submissions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start min-h-11 sm:min-h-8 -mx-1.5 px-1.5 rounded-lg text-xs font-display font-semibold text-primary-700 dark:text-primary-300 hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <ChevronDown size={14} aria-hidden className={cn('transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')} />
        {open ? 'Hide people' : `Show each person (${item.submissions.length})`}
      </button>
      {open && (
        <ul className="flex flex-col gap-2">
          {item.submissions.map((sub) => {
            const state = sub.isNotApplicable ? 'Not applicable' : sub.isDone ? 'Checked' : 'Not checked';
            return (
              <li key={sub.id} className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-surface-hover/30 p-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-display font-medium text-text">{personName(sub)}</span>
                  <span className={cn('text-xs font-display font-semibold', sub.isNotApplicable ? 'text-text-muted' : sub.isDone ? 'text-success' : 'text-warning')}>
                    {state}
                  </span>
                </div>
                <p className="text-xs font-display text-text-muted">
                  {sub.completedAt ? formatDateTime(sub.completedAt) : 'No time recorded'}
                  {sub.dressType ? ` \u00b7 Wearing: ${sub.dressType.name}` : ''}
                </p>
                {sub.remarks && (
                  <p className="text-xs font-display text-text-muted whitespace-pre-wrap break-words">
                    {sub.isNotApplicable ? 'Reason' : 'Remark'}: {sub.remarks}
                  </p>
                )}
                {sub.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sub.images.map((img) => <EvidenceThumb key={img.id} image={img} fallbackAlt={`Evidence for ${personName(sub)}`} />)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// How this question's answer was saved and edited: one line per change with who and when. Opens on
// demand and loads the run's whole history once, shared by every question's expander.
const ItemHistory = ({ item }: { item: ChecklistInstanceItem }) => {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError } = useChecklistItemHistoryQuery(item.instanceId, open);
  const events = (data ?? []).filter((e) => e.itemId === item.id);
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start min-h-11 sm:min-h-8 -mx-1.5 px-1.5 rounded-lg text-xs font-display font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <History size={13} aria-hidden />
        {open ? 'Hide answer history' : 'Answer history'}
      </button>
      {open && (
        isPending ? (
          <p className="text-xs font-display text-text-muted">Loading history...</p>
        ) : isError ? (
          <p className="text-xs font-display text-danger">Could not load the history. Try again in a moment.</p>
        ) : events.length === 0 ? (
          <p className="text-xs font-display text-text-muted">No changes recorded for this question.</p>
        ) : (
          <ol className="flex flex-col gap-1.5 border-l-2 border-border pl-3">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col">
                <span className="text-xs font-display font-medium text-text-secondary">{e.summary}</span>
                <span className="text-xs font-display text-text-muted">{e.actorName} &middot; {formatDateTime(e.at)}</span>
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  );
};

interface ReviewRowProps {
  item: ChecklistInstanceItem;
  /** A department head, PC or Admin who is not filling this run in: may waive a failing question. */
  canWaive: boolean;
  canRaiseTicket: boolean;
  flags: ItemFlags;
  selected: boolean;
  disabled: boolean;
  onToggle: (itemId: string) => void;
  /** This question's own note for the send-back; only shown while it is ticked. */
  note: string;
  onNoteChange?: (itemId: string, note: string) => void;
  /** The reviewer's note from the last send-back, shown on questions that were fixed since. */
  previousNote: string | null;
  /** When the run closed (ms). A question completed after this is flagged as answered late. */
  deadlineMs: number | null;
}

const ReviewRow = memo(function ReviewRow({ item, canWaive, canRaiseTicket, flags, selected, disabled, onToggle, note, onNoteChange, previousNote, deadlineMs }: ReviewRowProps) {
  const answer = item.isNotApplicable ? null : answerText(item);
  const answeredLate = deadlineMs != null && item.isDone && !!item.completedAt && new Date(item.completedAt).getTime() > deadlineMs;
  // Each question is its own small card, with space between cards, so a reviewer can read the run at a glance:
  // a light red wash and border where the answer was wrong (a "No" when Yes was wanted, an out-of-range number,
  // or a question already sent back), green where it was right. A question with no accepted-answer rule, a
  // waived one and a not-applicable one stay plain. Ticking a card to send it back deepens the red, so "wrong
  // answer" and "I am sending this back" can still be told apart.
  const verdict = answerVerdict(item);
  const wrong = flags.bad || flags.sentBack;
  const right = verdict === 'good' && !flags.sentBack && !flags.missingPhotos;

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3 transition-colors duration-150',
        selected
          ? 'border-danger/50 bg-danger/10 dark:bg-danger/20'
          : wrong
            ? 'border-danger/25 bg-danger/5 dark:bg-danger/10'
            : right
              ? 'border-success/30 bg-success/5 dark:bg-success/10'
              : 'border-border bg-surface',
      )}
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <p className="text-sm font-display font-medium text-text leading-snug min-w-0">{item.label}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {answeredLate && <IconChip icon={Timer} tone="bg-warning" label="Answered late" title="Completed after the run's closing time" />}
            {flags.critical && <IconChip icon={Flag} tone="bg-danger" label="Critical" title="Marked critical by the checklist author" />}
            {item.isNotApplicable && <IconChip icon={Ban} tone="bg-text-muted" label="Not applicable" />}
            {flags.bad && <IconChip icon={AlertTriangle} tone="bg-warning" label="Not an acceptable answer" />}
            {flags.sentBack && (
              <IconChip
                icon={CornerUpLeft}
                tone="bg-danger"
                label={item.reviewTicketId && item.sendBackCount === 1 ? 'Ticket raised' : item.sendBackCount === 1 ? 'Sent back once' : `Sent back ${item.sendBackCount} times`}
                title="Counts against compliance"
              />
            )}
            {flags.fixed && <IconChip icon={CheckCheck} tone="bg-success" label="Fixed after send-back" />}
            {flags.waived && <IconChip icon={ShieldCheck} tone="bg-primary-600" label="Waived" title={item.waiveReason ?? 'Excused by a reviewer'} />}
            {flags.missingPhotos && (
              <IconChip icon={AlertTriangle} tone="bg-danger" label={`Photos ${item.images.length}/${item.requiredImageCount}`} />
            )}
          </div>
        </div>

        <p className="text-xs font-display text-text-muted">{auditTrailLine(item)}</p>
        {answer && <p className="text-xs font-display text-text-secondary">{answer}</p>}
        {item.remarks && (
          <p className="text-xs font-display text-text-muted whitespace-pre-wrap break-words">
            {item.isNotApplicable ? 'Reason' : 'Remark'}: {item.remarks}
          </p>
        )}
        {flags.waived && item.waiveReason && (
          <p className="text-xs font-display text-text-muted whitespace-pre-wrap break-words border-l-2 border-primary-500/40 pl-2.5">
            Waived: {item.waiveReason}
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
        {item.itemType === 'AUDIT' && <AuditPeople item={item} />}
        {item.itemType !== 'AUDIT' && <ItemHistory item={item} />}
      </div>

      {/* What the reviewer can do with this question, in one labelled row at the bottom of its card:
          Send back on the left, Waive (only where it counts against compliance) on the right. The whole
          label is the tap target, 44px tall on a touch screen. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border/50 pt-1.5">
        {/* `relative` is load-bearing: the checkbox inside is visually hidden (absolutely positioned). Without
            this label as its anchor it sat outside the sheet's scrolling body, and ticking it made the browser
            scroll the whole sheet up to reach it: the header vanished and a blank gap opened under the buttons. */}
        <label
          className={cn(
            'relative inline-flex min-h-11 sm:min-h-9 select-none items-center gap-2 rounded-lg pr-3 transition-colors duration-150',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            selected ? 'text-danger' : 'text-text-secondary hover:text-text',
          )}
        >
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
              'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-danger/40',
              selected ? 'border-danger bg-danger text-white' : 'border-border bg-surface',
            )}
            aria-hidden
          >
            <Check size={13} strokeWidth={3} className={cn('transition-opacity duration-150', selected ? 'opacity-100' : 'opacity-0')} />
          </span>
          <span className="t-meta font-display font-semibold">{selected ? 'Sending back' : 'Send back'}</span>
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {(canRaiseTicket || item.reviewTicketId) && <RaiseTicketAction item={item} canRaise={canRaiseTicket} />}
          {canWaive && (flags.bad || flags.sentBack || flags.waived) && <WaiveAction instanceId={item.instanceId} item={item} />}
        </div>
      </div>

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
    </li>
  );
});

interface InstanceReviewPanelProps {
  items: ChecklistInstanceItem[];
  /** Show the Waive button on failing questions. The server still decides who may. */
  canWaive?: boolean;
  canRaiseTicket?: boolean;
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
  /** When the run closed (ms), so late answers can be flagged. Leave out to skip the flag. */
  deadlineMs?: number | null;
}

const SectionTitle = ({ children }: { children: string }) => (
  <h3 className="t-card font-display font-semibold text-text">{children}</h3>
);

// The body of a checklist waiting for review: failing questions first and open, everything else
// folded away, each with what was answered, any remark and photos, and a tick box to send just that
// question back (with an optional note of its own). Used by the Verification page's review pane and
// the department Approvals page, so both review the same way.
export const InstanceReviewPanel = memo(function InstanceReviewPanel({
  items, canWaive = false, canRaiseTicket = false, selected, onToggle, disabled = false, notes, onNoteChange, lastSendBackNote = null, showScores = true, deadlineMs = null,
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
      canWaive={canWaive}
      canRaiseTicket={canRaiseTicket}
      flags={flags}
      selected={selected.has(item.id)}
      disabled={disabled}
      onToggle={onToggle}
      note={notes?.[item.id] ?? ''}
      onNoteChange={onNoteChange}
      previousNote={lastSendBackNote}
      deadlineMs={deadlineMs}
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
          <ul className="flex flex-col gap-2">{look.map(renderRow)}</ul>
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
          {showRest && <ul className="flex flex-col gap-2">{rest.map(renderRow)}</ul>}
        </section>
      )}
    </div>
  );
});
